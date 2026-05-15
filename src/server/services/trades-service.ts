import { Direction, MarketType, TradeStatus } from "@prisma/client"
import {
  BINGX_DEFAULT_MAKER_FEE_BPS,
  BINGX_DEFAULT_TAKER_FEE_BPS,
  feeUsdtFromBps,
  notionalUsdt,
  parseLiquidityRole,
} from "@/lib/bingx-fees"
import { sumEntryVolume, sumExitVolume } from "@/lib/trade-volumes"
import { accountRepository } from "@/server/repositories/account-repository"
import { cashflowRepository } from "@/server/repositories/cashflow-repository"
import { tradesRepository } from "@/server/repositories/trades-repository"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"
import { exitRepository } from "@/server/repositories/exit-repository"
import type { TradesJournalListDto } from "@/contracts/trades"
import {
  attachJournalToTradesList,
  type TradeWithLegs,
  type TradeWithJournal,
} from "@/server/trading/journal-metrics"
import { buildJournalEquitySummary } from "@/server/trading/equity-timeline"
import { buildJournalRiskPack } from "@/server/trading/attach-journal-risk"
import { tradeLeverageFromEntries } from "@/server/trading/position-margin"
import { serializeTradeListItem } from "@/server/trading/serialize-trade"
import type { JournalListQueryForService } from "@/server/trades/journal-list-query"
import { tradePatchBodySchema } from "@/server/validation/trade-patch"
import { zodErrorMessage } from "@/server/validation/zod-helpers"

function toTradeWithLegs(row: {
  entries: TradeWithLegs["entries"]
  exits: TradeWithLegs["exits"]
} & Omit<TradeWithLegs, "entries" | "exits">): TradeWithLegs {
  return {
    ...row,
    exits: row.exits.filter((e) => e.deletedAt == null),
  }
}

async function packJournalList(rows: TradeWithLegs[], userId: string): Promise<TradesJournalListDto> {
  const rs = await riskSettingsRepository.upsertDefaults(userId)
  const journalAllAccounts = rs.journalAllAccounts ?? false
  const journalAccountId = rs.activeAccountId ?? undefined
  let cashflows: Awaited<ReturnType<typeof cashflowRepository.listForJournalScope>> = []
  try {
    cashflows = await cashflowRepository.listForJournalScope(
      userId,
      journalAllAccounts,
      journalAccountId,
    )
  } catch (err) {
    console.error("cashflow list skipped (journal still loads):", err)
  }
  const equityTradesRaw = await tradesRepository.findClosedWithLegsForJournalScope(
    userId,
    journalAllAccounts,
    journalAccountId,
  )
  const equityTrades = equityTradesRaw.map((t) => toTradeWithLegs(t))
  const scope = { journalAllAccounts, journalAccountId }
  const summaryBase = buildJournalEquitySummary(equityTrades, cashflows, scope, {
    openCount: rows.filter((t) => t.status === TradeStatus.OPEN).length,
  })
  const { perTrade, summary: riskSummary } = await buildJournalRiskPack(
    userId,
    rows,
    summaryBase,
    scope,
  )
  const summary = { ...summaryBase, risk: riskSummary }
  const withJ = attachJournalToTradesList(rows, perTrade)
  return {
    trades: withJ.map(serializeTradeListItem),
    summary,
  }
}

async function packSingle(userId: string, row: TradeWithLegs): Promise<TradeWithJournal> {
  const list = await packJournalList([row], userId)
  const risk = list.trades[0]?.risk
  const withJ = attachJournalToTradesList([row], risk ? new Map([[row.id, risk]]) : undefined)
  return withJ[0]!
}

async function resolveAccountIdForOpen(
  userId: string,
  body: Record<string, unknown>,
): Promise<string | null> {
  const raw = body.accountId
  if (raw != null && String(raw).trim() !== "") {
    const id = String(raw).trim()
    const a = await accountRepository.findFirst(userId, id)
    if (a) return a.id
  }
  await accountRepository.ensureDefaultAndBackfill(userId)
  const rs = await riskSettingsRepository.upsertDefaults(userId)
  if (rs.activeAccountId) {
    const a = await accountRepository.findFirst(userId, rs.activeAccountId)
    if (a) return a.id
  }
  const list = await accountRepository.listByUser(userId)
  const def = list.find((x) => x.isDefault) ?? list[0]
  return def?.id ?? null
}

export const tradesService = {
  async listDistinctSymbols(userId: string, status?: TradeStatus): Promise<string[]> {
    return tradesRepository.distinctSymbols(userId, status)
  },

  async listDistinctStrategies(userId: string, status?: TradeStatus): Promise<string[]> {
    return tradesRepository.distinctStrategies(userId, status)
  },

  async listJournal(userId: string, parsed: JournalListQueryForService): Promise<TradesJournalListDto> {
    const raw =
      parsed.kind === "none"
        ? await tradesRepository.findManyActiveWithLegs(userId)
        : await tradesRepository.findManyActiveWithLegsFiltered(userId, parsed.filters)
    const rows = raw.map((t) => toTradeWithLegs(t))
    return packJournalList(rows, userId)
  },

  async openTrade(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; trade: ReturnType<typeof serializeTradeListItem> }
    | { ok: false; error: string; status: number }
  > {
    const symbol = String(body.symbol ?? "").trim()
    const dirRaw = String(body.direction ?? "").toUpperCase()
    const direction =
      dirRaw === "SHORT" ? Direction.SHORT : dirRaw === "LONG" ? Direction.LONG : null
    const marketType = (body.marketType as MarketType) ?? MarketType.FUTURE
    const price = Number(body.price)
    const volume = Number(body.volume)

    if (
      !symbol ||
      direction == null ||
      !Number.isFinite(price) ||
      !Number.isFinite(volume) ||
      volume <= 0 ||
      price <= 0
    ) {
      return {
        ok: false,
        error: "Нужны символ, направление, цена > 0 и маржа > 0",
        status: 400,
      }
    }

    const accountId = await resolveAccountIdForOpen(userId, body)
    if (!accountId) {
      return {
        ok: false,
        error: "Не удалось определить счёт. Откройте Настройки → Счета.",
        status: 400,
      }
    }

    const settings = await riskSettingsRepository.upsertDefaults(userId)
    const makerBps = Number(settings.makerFeeBps) || BINGX_DEFAULT_MAKER_FEE_BPS
    const takerBps = Number(settings.takerFeeBps) || BINGX_DEFAULT_TAKER_FEE_BPS
    const liquidityRole = parseLiquidityRole(body.liquidityRole)
    const levRaw = body.leverage != null ? Number(body.leverage) : NaN
    const entryLev = Number.isFinite(levRaw) && levRaw > 0 ? Math.round(levRaw) : 1
    const notion = notionalUsdt(volume, entryLev)

    let entryFee = 0
    if (body.fee != null && body.fee !== "") {
      const n = Number(body.fee)
      if (Number.isFinite(n) && n >= 0) entryFee = n
    } else {
      entryFee = feeUsdtFromBps(notion, liquidityRole, makerBps, takerBps)
    }

    const openingFunding =
      body.funding != null && body.funding !== "" && Number.isFinite(Number(body.funding))
        ? Number(body.funding)
        : 0

    const existing = await tradesRepository.findOpenTradeId(
      userId,
      accountId,
      symbol,
      direction,
      marketType,
    )

    const entryCreate = {
      price,
      volume,
      fee: entryFee,
      liquidityRole,
      ...(entryLev > 1 ? { leverage: entryLev } : {}),
    }

    const strategy = body.strategy ? String(body.strategy) : undefined
    const emotionEntry = body.emotionEntry ? String(body.emotionEntry) : undefined
    const notes = body.notes ? String(body.notes) : undefined

    let stopLossPrice: number | null = null
    if (body.stopLossPrice != null && body.stopLossPrice !== "") {
      const sl = Number(body.stopLossPrice)
      if (Number.isFinite(sl) && sl > 0) stopLossPrice = sl
    }

    let trade = existing
      ? await tradesRepository.updateTradeAddEntry({
          tradeId: existing.id,
          strategy,
          emotionEntry,
          notes,
          entryFee,
          entryCreate,
        })
      : await tradesRepository.createTradeWithEntry({
          userId,
          accountId,
          symbol,
          marketType,
          direction,
          strategy,
          emotionEntry,
          notes,
          entryFee,
          openingFunding,
          stopLossPrice,
          entryCreate,
        })

    if (existing && stopLossPrice != null) {
      await tradesRepository.patchTradeFields(userId, existing.id, { stopLossPrice })
      const refreshed = await tradesRepository.findFirstActiveWithLegs(userId, existing.id)
      if (refreshed) trade = refreshed
    }

    const row = toTradeWithLegs(trade)
    return { ok: true, trade: serializeTradeListItem(await packSingle(userId, row)) }
  },

  async closeTrade(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; trade: ReturnType<typeof serializeTradeListItem> }
    | { ok: false; error: string; status: number }
  > {
    const tradeId = String(body.id ?? "")
    const exitPrice = Number(body.exitPrice)

    if (!tradeId || !Number.isFinite(exitPrice) || exitPrice <= 0) {
      return { ok: false, error: "Нужны id и цена выхода > 0", status: 400 }
    }

    const trade = await tradesRepository.findFirstActiveWithLegs(userId, tradeId)

    if (!trade) {
      return { ok: false, error: "Not found", status: 404 }
    }

    if (trade.status === TradeStatus.CLOSED) {
      return { ok: false, error: "Already closed", status: 400 }
    }

    const entryVol = sumEntryVolume(trade)
    const exitVol = sumExitVolume(trade)
    const remaining = entryVol - exitVol

    if (remaining <= 0) {
      return { ok: false, error: "No position to close", status: 400 }
    }

    let exitVolume = body.exitVolume != null ? Number(body.exitVolume) : remaining
    if (!Number.isFinite(exitVolume) || exitVolume <= 0) {
      return { ok: false, error: "Invalid exit volume", status: 400 }
    }
    if (exitVolume > remaining) {
      exitVolume = remaining
    }

    const liquidityRole = parseLiquidityRole(body.liquidityRole)

    const settings = await riskSettingsRepository.upsertDefaults(userId)
    const makerBps = Number(settings.makerFeeBps) || BINGX_DEFAULT_MAKER_FEE_BPS
    const takerBps = Number(settings.takerFeeBps) || BINGX_DEFAULT_TAKER_FEE_BPS

    const exitLev = tradeLeverageFromEntries(trade.entries)
    const notion = notionalUsdt(exitVolume, exitLev)
    let exitFee = 0
    if (body.fee != null && body.fee !== "") {
      const n = Number(body.fee)
      if (Number.isFinite(n) && n >= 0) exitFee = n
    } else {
      exitFee = feeUsdtFromBps(notion, liquidityRole, makerBps, takerBps)
    }

    const exitFunding =
      body.funding != null && body.funding !== "" && Number.isFinite(Number(body.funding))
        ? Number(body.funding)
        : 0

    const emotionExit =
      body.emotionExit != null && String(body.emotionExit).trim() !== ""
        ? String(body.emotionExit).trim()
        : null

    const updated = await tradesRepository.addExitAndRefreshTrade(userId, {
      tradeId,
      entryVolume: entryVol,
      exitPrice,
      exitVolume,
      exitFee,
      exitFunding,
      emotionExit,
      liquidityRole,
    })

    if (!updated) {
      return { ok: false, error: "Not found", status: 404 }
    }

    const row = toTradeWithLegs(updated)
    return { ok: true, trade: serializeTradeListItem(await packSingle(userId, row)) }
  },

  async patchTrade(
    userId: string,
    tradeId: string,
    body: unknown,
  ): Promise<
    | { ok: true; trade: ReturnType<typeof serializeTradeListItem> }
    | { ok: false; error: string; status: number }
  > {
    const parsed = tradePatchBodySchema.safeParse(body)
    if (!parsed.success) {
      return { ok: false, error: zodErrorMessage(parsed.error), status: 400 }
    }
    if (Object.keys(parsed.data).length === 0) {
      return { ok: false, error: "Нет полей для обновления", status: 400 }
    }

    const data: { stopLossPrice?: number | null } = {}
    if (parsed.data.stopLossPrice !== undefined) {
      data.stopLossPrice = parsed.data.stopLossPrice
    }

    const n = await tradesRepository.patchTradeFields(userId, tradeId, data)
    if (n.count === 0) {
      return { ok: false, error: "Not found", status: 404 }
    }

    const row = await tradesRepository.findFirstActiveWithLegs(userId, tradeId)
    if (!row) {
      return { ok: false, error: "Not found", status: 404 }
    }
    return {
      ok: true,
      trade: serializeTradeListItem(await packSingle(userId, toTradeWithLegs(row))),
    }
  },

  async deleteTradeOrExit(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; mode: "trade" | "exit" }
    | { ok: false; error: string; status: number }
  > {
    const tradeId = String(body.id ?? "")
    const exitIdRaw = body.exitId
    const exitId =
      exitIdRaw != null && exitIdRaw !== "" ? String(exitIdRaw) : ""

    if (!tradeId) {
      return { ok: false, error: "Invalid payload", status: 400 }
    }

    if (exitId) {
      const r = await exitRepository.softDeleteExit(userId, tradeId, exitId)
      if (!r.ok) {
        return { ok: false, error: "Not found", status: 404 }
      }
      return { ok: true, mode: "exit" }
    }

    const n = await tradesRepository.softDeleteTrade(userId, tradeId)
    if (n.count === 0) {
      return { ok: false, error: "Not found", status: 404 }
    }
    return { ok: true, mode: "trade" }
  },
}
