import { pnlRoiForExitLeg } from "@/lib/exit-leg-pnl"
import {
  hourlyReturnPercent,
  parseIsoToDate,
  pullbackPercentMvp,
  safeZoneBounds,
  stopPlacementValid,
  suggestedMarginAddUsdtMvp,
  validateDayStatsRange,
} from "@/lib/dashboard-metrics"
import type {
  AveragingComputeResultDto,
  AveragingContextDto,
  AveragingInputPerTradeDto,
  DashboardDayStatsDto,
} from "@/contracts/dashboard"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"
import { cashflowRepository } from "@/server/repositories/cashflow-repository"
import { tradesRepository } from "@/server/repositories/trades-repository"
import { buildTradeJournalMetrics, type TradeWithLegs } from "@/server/trading/journal-metrics"
import { netCashflowPortfolioUsdt } from "@/server/trading/cashflow-usdt"
import { capitalUsdtBeforeExclusive } from "@/server/trading/equity-timeline"
import { Direction } from "@prisma/client"

function toTradeWithLegs(row: {
  entries: TradeWithLegs["entries"]
  exits: TradeWithLegs["exits"]
} & Omit<TradeWithLegs, "entries" | "exits">): TradeWithLegs {
  return {
    ...row,
    exits: row.exits.filter((e) => e.deletedAt == null),
  }
}

export const dashboardService = {
  async getDayStats(
    userId: string,
    dayStartIso: string,
    dayEndExclusiveIso: string,
    accountId?: string,
  ): Promise<{ ok: true; data: DashboardDayStatsDto } | { ok: false; error: string; status: number }> {
    const start = parseIsoToDate(dayStartIso)
    const end = parseIsoToDate(dayEndExclusiveIso)
    if (!start || !end) {
      return { ok: false, error: "Некорректные dayStart / dayEndExclusive (ISO 8601)", status: 400 }
    }
    const rangeErr = validateDayStatsRange(start, end)
    if (rangeErr) {
      return { ok: false, error: rangeErr, status: 400 }
    }

    const exits = await tradesRepository.findExitsInTimestampHalfOpenRange(
      userId,
      start,
      end,
      accountId,
    )
    let pnlUsdt = 0
    for (const ex of exits) {
      const t = ex.trade
      pnlUsdt += pnlRoiForExitLeg(t.direction, t.entries, ex).pnl
    }

    const rs = await riskSettingsRepository.upsertDefaults(userId)
    const journalAllAccounts = accountId != null ? false : (rs.journalAllAccounts ?? false)
    const journalAccountId = accountId ?? rs.activeAccountId ?? undefined
    const scope = { journalAllAccounts, journalAccountId }

    let cashflows: Awaited<ReturnType<typeof cashflowRepository.listForJournalScope>> = []
    try {
      cashflows = await cashflowRepository.listForJournalScope(
        userId,
        journalAllAccounts,
        journalAccountId,
      )
    } catch {
      /* journal without cashflow table */
    }

    const tStart = start.getTime()
    const cfBefore = cashflows.filter((c) => c.timestamp.getTime() < tStart)
    const tradesBefore = await tradesRepository.findClosedTradesClosedBefore(
      userId,
      start,
      journalAllAccounts,
      journalAccountId,
    )
    const journalHasCashflow = cashflows.length > 0
    let balanceAtDayStart = capitalUsdtBeforeExclusive(
      start,
      tradesBefore as TradeWithLegs[],
      cfBefore,
      scope,
      journalHasCashflow,
    )
    if (!Number.isFinite(balanceAtDayStart)) balanceAtDayStart = 0
    if (balanceAtDayStart < 1e-9 && journalHasCashflow) {
      const netBefore = netCashflowPortfolioUsdt(cfBefore, scope)
      if (netBefore > 1e-9) {
        balanceAtDayStart = netBefore
      } else {
        const netAll = netCashflowPortfolioUsdt(cashflows, scope)
        balanceAtDayStart = Math.max(netAll, 0)
      }
    }

    const roiDayPercent =
      balanceAtDayStart > 1e-9 ? (pnlUsdt / balanceAtDayStart) * 100 : null

    return {
      ok: true,
      data: {
        pnlUsdt,
        closedCount: exits.length,
        roiDayPercent,
        balanceAtDayStartUsdt: balanceAtDayStart,
        displayCurrency: "USDT",
      },
    }
  },

  async getAveragingContext(
    userId: string,
    accountId?: string,
  ): Promise<{ ok: true; data: AveragingContextDto } | { ok: false; error: string; status: number }> {
    const rs = await riskSettingsRepository.upsertDefaults(userId)
    const raw = await tradesRepository.findOpenTradesWithLegs(userId, accountId)
    const positions = raw.map((t) => {
      const row = toTradeWithLegs(t)
      const j = buildTradeJournalMetrics(row)
      const lev = Math.max(1, j.maxLeverage || 1)
      const avg = j.avgEntry ?? 0
      const bounds = safeZoneBounds(avg, Number(rs.riskPerTrade) || 0, lev)
      return {
        tradeId: row.id,
        symbol: row.symbol,
        direction: row.direction === Direction.SHORT ? ("SHORT" as const) : ("LONG" as const),
        avgEntry: avg,
        leverage: lev,
        entryVolume: j.entryVolume,
        safeZoneLow: bounds.low,
        safeZoneHigh: bounds.high,
      }
    })

    return {
      ok: true,
      data: {
        quoteSource: "manual",
        riskPerTrade: Number(rs.riskPerTrade) || 0,
        riskPerDay: Number(rs.riskPerDay) || 0,
        accountBalance: Number(rs.accountBalance) || 0,
        positions,
      },
    }
  },

  async computeAveraging(
    userId: string,
    accountId: string | undefined,
    inputs: Record<string, AveragingInputPerTradeDto>,
  ): Promise<{ ok: true; data: AveragingComputeResultDto }> {
    const ctxRes = await this.getAveragingContext(userId, accountId)
    if (!ctxRes.ok) {
      throw new Error(ctxRes.error)
    }
    const ctx = ctxRes.data
    const rows = ctx.positions.map((p) => {
      const dir = p.direction === "SHORT" ? Direction.SHORT : Direction.LONG
      const input = inputs[p.tradeId] ?? {
        priceNow: null,
        price1hAgo: null,
        stopPrice: null,
      }

      const warnings: string[] = []
      let pullbackPercent: number | null = null
      let hourlyReturnPercentVal: number | null = null
      let suggestedMarginAddUsdt: number | null = null

      const priceNow = input.priceNow
      const price1h = input.price1hAgo
      const stop = input.stopPrice

      if (priceNow != null && priceNow > 0) {
        pullbackPercent = pullbackPercentMvp(dir, p.avgEntry, priceNow)
      }

      if (
        priceNow != null &&
        priceNow > 0 &&
        price1h != null &&
        price1h > 0
      ) {
        hourlyReturnPercentVal = hourlyReturnPercent(priceNow, price1h)
      }

      if (
        priceNow != null &&
        priceNow > 0 &&
        stop != null &&
        stop > 0
      ) {
        if (!stopPlacementValid(dir, priceNow, stop)) {
          warnings.push("Стоп с некорректной стороны относительно текущей цены и направления")
        } else {
          const sug = suggestedMarginAddUsdtMvp({
            accountBalance: ctx.accountBalance,
            riskPerTradePercent: ctx.riskPerTrade,
            riskPerDayPercent: ctx.riskPerDay,
            currentPrice: priceNow,
            stopPrice: stop,
          })
          suggestedMarginAddUsdt = sug.value
          if (sug.warning) warnings.push(sug.warning)
        }
      }

      return {
        tradeId: p.tradeId,
        symbol: p.symbol,
        direction: p.direction,
        avgEntry: p.avgEntry,
        leverage: p.leverage,
        safeZoneLow: p.safeZoneLow,
        safeZoneHigh: p.safeZoneHigh,
        pullbackPercent,
        hourlyReturnPercent: hourlyReturnPercentVal,
        suggestedMarginAddUsdt,
        warnings,
      }
    })

    return { ok: true, data: { rows } }
  },
}
