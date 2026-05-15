import { CashflowType } from "@prisma/client"
import type { CashflowListResponseDto, CashflowDto } from "@/contracts/cashflow"
import {
  cashflowCreateBodySchema,
  cashflowPatchBodySchema,
} from "@/server/validation/cashflow"
import { zodErrorMessage } from "@/server/validation/zod-helpers"
import { accountRepository } from "@/server/repositories/account-repository"
import { cashflowRepository } from "@/server/repositories/cashflow-repository"
import type { Prisma } from "@prisma/client"
import { tradesRepository } from "@/server/repositories/trades-repository"
import {
  cashflowPortfolioDeltaUsdt,
  effectiveFxRateToUsdt,
  type JournalEquityScope,
} from "@/server/trading/cashflow-usdt"
import { buildJournalEquitySummary } from "@/server/trading/equity-timeline"
import type { TradeWithLegs } from "@/server/trading/journal-metrics"
import { serializeCashflow } from "@/server/trading/serialize-cashflow"

function toTradeWithLegs(row: TradeWithLegs): TradeWithLegs {
  return {
    ...row,
    exits: row.exits.filter((e) => e.deletedAt == null),
  }
}

async function assertAccountOwned(userId: string, accountId: string): Promise<boolean> {
  const a = await accountRepository.findFirst(userId, accountId)
  return !!a
}

function parseTimestamp(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d : null
}

function journalScopeFromSettings(
  journalAllAccounts: boolean,
  activeAccountId: string | null | undefined,
  legacyCashflowAccountId: string | null | undefined,
): JournalEquityScope {
  return {
    journalAllAccounts,
    journalAccountId: activeAccountId ?? undefined,
    ...(legacyCashflowAccountId ? { legacyCashflowAccountId } : {}),
  }
}

export const cashflowService = {
  async list(
    userId: string,
    query: {
      journalAllAccounts: boolean
      journalAccountId: string | undefined
      fromIso?: string | null
      toIso?: string | null
    },
  ): Promise<CashflowListResponseDto> {
    const legacyCashflowAccountId = await accountRepository.findDefaultAccountId(userId)
    const scope = journalScopeFromSettings(
      query.journalAllAccounts,
      query.journalAccountId,
      legacyCashflowAccountId,
    )
    const fromUtc = query.fromIso ? new Date(query.fromIso) : undefined
    const toUtc = query.toIso ? new Date(query.toIso) : undefined
    const range =
      fromUtc && Number.isFinite(fromUtc.getTime()) && toUtc && Number.isFinite(toUtc.getTime())
        ? { fromUtc, toUtc }
        : undefined

    const rows = await cashflowRepository.listForPortfolio(
      userId,
      query.journalAllAccounts,
      query.journalAccountId,
      range,
      legacyCashflowAccountId ?? undefined,
    )

    const inPeriod = range
      ? rows.filter((r) => {
          const t = r.timestamp.getTime()
          return t >= range.fromUtc!.getTime() && t <= range.toUtc!.getTime()
        })
      : rows

    let netFlowPeriodUsdt = 0
    for (const r of inPeriod) {
      const d = cashflowPortfolioDeltaUsdt(r, scope)
      if (Number.isFinite(d)) netFlowPeriodUsdt += d
    }

    const cashflowsAll = await cashflowRepository.listForJournalScope(
      userId,
      query.journalAllAccounts,
      query.journalAccountId,
      legacyCashflowAccountId ?? undefined,
    )
    const equityTradesRaw = await tradesRepository.findClosedWithLegsForJournalScope(
      userId,
      query.journalAllAccounts,
      query.journalAccountId,
    )
    const equityTrades = equityTradesRaw.map((t) => toTradeWithLegs(t as TradeWithLegs))
    const summaryEq = buildJournalEquitySummary(equityTrades, cashflowsAll, scope, {
      openCount: 0,
    })

    return {
      cashflows: rows.map(serializeCashflow),
      summary: {
        netFlowPeriodUsdt,
        balanceEstimateUsdt: summaryEq.balanceEstimateUsdt,
        totalPnlClosedUsdt: summaryEq.totalPnlClosedUsdt,
      },
    }
  },

  async create(
    userId: string,
    body: unknown,
  ): Promise<{ ok: true; cashflow: CashflowDto } | { ok: false; error: string; status: number }> {
    const parsed = cashflowCreateBodySchema.safeParse(body)
    if (!parsed.success) {
      return { ok: false, error: zodErrorMessage(parsed.error), status: 400 }
    }
    const o = parsed.data
    const ts = parseTimestamp(o.timestamp)
    if (!ts) {
      return { ok: false, error: "Некорректный timestamp", status: 400 }
    }

    const cur = o.currency.trim()
    const fx = effectiveFxRateToUsdt(cur, o.fxRate ?? null)
    if (!Number.isFinite(fx)) {
      return {
        ok: false,
        error: "Для валюты ≠ USDT укажите fxRate > 0 (USDT за 1 единицу валюты)",
        status: 400,
      }
    }

    if (o.type === "DEPOSIT" || o.type === "WITHDRAWAL") {
      const acc = o.accountId?.trim()
      if (!acc) {
        return { ok: false, error: "Нужен accountId", status: 400 }
      }
      if (!(await assertAccountOwned(userId, acc))) {
        return { ok: false, error: "Счёт не найден", status: 400 }
      }
      const created = await cashflowRepository.create({
        userId,
        type: o.type as CashflowType,
        accountId: acc,
        amount: o.amount,
        currency: cur,
        fxRate: cur.toUpperCase() === "USDT" ? null : o.fxRate ?? null,
        fee: o.fee ?? null,
        timestamp: ts,
        note: o.note ?? null,
      })
      return { ok: true, cashflow: serializeCashflow(created) }
    }

    const fromId = o.fromAccountId?.trim()
    const toId = o.toAccountId?.trim()
    if (!fromId || !toId) {
      return { ok: false, error: "Перевод: нужны fromAccountId и toAccountId", status: 400 }
    }
    if (fromId === toId) {
      return { ok: false, error: "Счёт отправителя и получателя должны различаться", status: 400 }
    }
    if (!(await assertAccountOwned(userId, fromId)) || !(await assertAccountOwned(userId, toId))) {
      return { ok: false, error: "Счёт не найден", status: 400 }
    }

    const created = await cashflowRepository.create({
      userId,
      type: CashflowType.TRANSFER,
      fromAccountId: fromId,
      toAccountId: toId,
      amount: o.amount,
      currency: cur,
      fxRate: cur.toUpperCase() === "USDT" ? null : o.fxRate ?? null,
      fee: o.fee ?? null,
      timestamp: ts,
      note: o.note ?? null,
    })
    return { ok: true, cashflow: serializeCashflow(created) }
  },

  async update(
    userId: string,
    id: string,
    body: unknown,
  ): Promise<{ ok: true; cashflow: CashflowDto } | { ok: false; error: string; status: number }> {
    const existing = await cashflowRepository.findFirst(userId, id)
    if (!existing) {
      return { ok: false, error: "Not found", status: 404 }
    }

    const parsed = cashflowPatchBodySchema.safeParse(body)
    if (!parsed.success) {
      return { ok: false, error: zodErrorMessage(parsed.error), status: 400 }
    }
    const o = parsed.data
    if (Object.keys(o).length === 0) {
      return { ok: true, cashflow: serializeCashflow(existing) }
    }

    const data: Prisma.CashflowUncheckedUpdateInput = {}

    const nextType = (o.type ?? existing.type) as CashflowType

    if (o.type != null) data.type = o.type as CashflowType
    if (o.amount != null) data.amount = o.amount
    if (o.currency != null) data.currency = o.currency.trim()
    if (o.fxRate !== undefined) data.fxRate = o.fxRate
    if (o.fee !== undefined) data.fee = o.fee
    if (o.note !== undefined) data.note = o.note
    if (o.timestamp != null) {
      const ts = parseTimestamp(o.timestamp)
      if (!ts) return { ok: false, error: "Некорректный timestamp", status: 400 }
      data.timestamp = ts
    }
    if (o.accountId !== undefined) data.accountId = o.accountId?.trim() ?? null
    if (o.fromAccountId !== undefined) data.fromAccountId = o.fromAccountId?.trim() ?? null
    if (o.toAccountId !== undefined) data.toAccountId = o.toAccountId?.trim() ?? null

    if (nextType === CashflowType.TRANSFER) {
      data.accountId = null
    } else {
      data.fromAccountId = null
      data.toAccountId = null
    }

    const cur = (typeof data.currency === "string" ? data.currency : undefined) ?? existing.currency
    const fxRaw =
      o.fxRate !== undefined ? o.fxRate : existing.fxRate
    const fx = effectiveFxRateToUsdt(String(cur), fxRaw ?? null)
    if (!Number.isFinite(fx)) {
      return {
        ok: false,
        error: "Для валюты ≠ USDT укажите fxRate > 0",
        status: 400,
      }
    }

    const mergedAccountId =
      o.accountId !== undefined ? (o.accountId?.trim() ?? null) : existing.accountId
    const mergedFrom =
      o.fromAccountId !== undefined ? (o.fromAccountId?.trim() ?? null) : existing.fromAccountId
    const mergedTo =
      o.toAccountId !== undefined ? (o.toAccountId?.trim() ?? null) : existing.toAccountId

    if (nextType === CashflowType.DEPOSIT || nextType === CashflowType.WITHDRAWAL) {
      if (!mergedAccountId) {
        return { ok: false, error: "Нужен accountId", status: 400 }
      }
      if (!(await assertAccountOwned(userId, mergedAccountId))) {
        return { ok: false, error: "Счёт не найден", status: 400 }
      }
    } else {
      if (!mergedFrom || !mergedTo) {
        return { ok: false, error: "Перевод: нужны fromAccountId и toAccountId", status: 400 }
      }
      if (mergedFrom === mergedTo) {
        return { ok: false, error: "Счета должны различаться", status: 400 }
      }
      if (!(await assertAccountOwned(userId, mergedFrom)) || !(await assertAccountOwned(userId, mergedTo))) {
        return { ok: false, error: "Счёт не найден", status: 400 }
      }
    }

    const updated = await cashflowRepository.update(userId, id, data)
    if (!updated) {
      return { ok: false, error: "Not found", status: 404 }
    }
    return { ok: true, cashflow: serializeCashflow(updated) }
  },

  async remove(userId: string, id: string): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    const n = await cashflowRepository.delete(userId, id)
    if (n === 0) return { ok: false, error: "Not found", status: 404 }
    return { ok: true }
  },
}
