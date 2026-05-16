/**
 * Агрегаты аналитики (этап 3). По выходам (сделкам), как дашборд; UI не дублирует.
 */

import { TradeStatus, type Cashflow, type Exit } from "@prisma/client"
import { formatInTimeZone } from "date-fns-tz"
import { pnlRoiForExitLeg } from "@/lib/exit-leg-pnl"
import { zonedPeriodHalfOpenUtc } from "@/lib/zoned-date-range"
import type {
  AnalyticsDayPnlDto,
  AnalyticsEmotionSliceDto,
  AnalyticsHistogramBinDto,
  AnalyticsHourSliceDto,
  AnalyticsMarketDirectionSliceDto,
  AnalyticsSnapshotDto,
  AnalyticsStrategySliceDto,
  AnalyticsSummaryDto,
  AnalyticsSymbolSliceDto,
  AnalyticsWeekdaySliceDto,
  AnalyticsWinLossDto,
} from "@/contracts/analytics"
import {
  buildTradeJournalMetrics,
  type TradeWithLegs,
} from "@/server/trading/journal-metrics"
import {
  buildAnalyticsEquityCurveFromExits,
  equityUsdtBeforeExitLeg,
  maxDrawdownFromBalances,
} from "@/server/trading/equity-timeline"
import { netCashflowPortfolioUsdt, type JournalEquityScope } from "@/server/trading/cashflow-usdt"
import { JOURNAL_INITIAL_DEPOSIT_USDT } from "@/server/trading/equity-constants"

function toLegs(t: TradeWithLegs): TradeWithLegs {
  return {
    ...t,
    exits: t.exits.filter((e) => e.deletedAt == null),
  }
}

const HIST_BINS = 12

function buildHistogram(pnls: number[]): AnalyticsHistogramBinDto[] {
  if (pnls.length === 0) return []
  const min = Math.min(...pnls)
  const max = Math.max(...pnls)
  if (min === max) {
    return [{ binStart: min, binEnd: max, count: pnls.length }]
  }
  const step = (max - min) / HIST_BINS
  const bins: AnalyticsHistogramBinDto[] = []
  for (let i = 0; i < HIST_BINS; i++) {
    const binStart = min + i * step
    const binEnd = i === HIST_BINS - 1 ? max : min + (i + 1) * step
    bins.push({ binStart, binEnd, count: 0 })
  }
  for (const p of pnls) {
    let idx = Math.floor((p - min) / step)
    if (idx >= HIST_BINS) idx = HIST_BINS - 1
    if (idx < 0) idx = 0
    bins[idx]!.count += 1
  }
  return bins
}

function sharpeFromDailyPnls(daily: number[]): number | null {
  if (daily.length < 2) return null
  const n = daily.length
  const mean = daily.reduce((a, b) => a + b, 0) / n
  let varSum = 0
  for (const x of daily) {
    varSum += (x - mean) ** 2
  }
  const std = Math.sqrt(varSum / n)
  if (std < 1e-12) return null
  return mean / std
}

type AnalyticsExitEvent = {
  trade: TradeWithLegs
  exit: Exit
  at: Date
  pnl: number
  roiLegPct: number | null
}

function collectExitEventsInPeriod(
  trades: TradeWithLegs[],
  startUtc: Date,
  endExclusiveUtc: Date,
): AnalyticsExitEvent[] {
  const t0 = startUtc.getTime()
  const t1 = endExclusiveUtc.getTime()
  const events: AnalyticsExitEvent[] = []
  for (const trade of trades) {
    const t = toLegs(trade)
    for (const exit of t.exits) {
      if (exit.deletedAt != null) continue
      const at = exit.timestamp
      const ts = at.getTime()
      if (ts < t0 || ts >= t1) continue
      const leg = pnlRoiForExitLeg(t.direction, t.entries, exit)
      events.push({ trade: t, exit, at, pnl: leg.pnl, roiLegPct: leg.roiPct })
    }
  }
  events.sort((a, b) => {
    const d = a.at.getTime() - b.at.getTime()
    if (d !== 0) return d
    return a.exit.id.localeCompare(b.exit.id)
  })
  return events
}

export type BuildAnalyticsInput = {
  timeZone: string
  fromYmd: string
  toYmd: string
  journalAllAccounts: boolean
  accountId: string | null
  symbolFilter: string | null
  strategyFilter: string | null
  marketTypeFilter: string | null
  /** Все сделки журнала для equity до/после выхода. */
  allTradesForEquity: TradeWithLegs[]
  /** Трейды с выходом в периоде (фильтры аналитики). */
  tradesWithExitsInPeriod: TradeWithLegs[]
  cashflowsStrictlyBeforeStart: Cashflow[]
  cashflowsInPeriod: Cashflow[]
  journalHasCashflow: boolean
  periodStartUtc: Date
  periodEndExclusiveUtc: Date
  legacyCashflowAccountId?: string | null
}

export function buildAnalyticsSnapshot(input: BuildAnalyticsInput): AnalyticsSnapshotDto {
  const {
    timeZone,
    fromYmd,
    toYmd,
    journalAllAccounts,
    accountId,
    symbolFilter,
    strategyFilter,
    marketTypeFilter,
    allTradesForEquity,
    tradesWithExitsInPeriod,
    cashflowsStrictlyBeforeStart,
    cashflowsInPeriod,
    journalHasCashflow,
    periodStartUtc,
    periodEndExclusiveUtc,
    legacyCashflowAccountId,
  } = input

  const scope: JournalEquityScope = {
    journalAllAccounts,
    journalAccountId: accountId ?? undefined,
    ...(legacyCashflowAccountId ? { legacyCashflowAccountId } : {}),
  }

  const allCashflows = [...cashflowsStrictlyBeforeStart, ...cashflowsInPeriod]
  const cfSorted = allCashflows
    .slice()
    .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())

  const capital0Raw = equityUsdtBeforeExitLeg(
    periodStartUtc,
    allTradesForEquity,
    cfSorted,
    scope,
    journalHasCashflow,
  )
  const capital0 = Number.isFinite(capital0Raw) ? capital0Raw : JOURNAL_INITIAL_DEPOSIT_USDT

  const netCfAll = netCashflowPortfolioUsdt(allCashflows, scope)
  const journalDepositUsdt = journalHasCashflow
    ? Math.max(Number.isFinite(netCfAll) ? netCfAll : 0, 0)
    : JOURNAL_INITIAL_DEPOSIT_USDT

  const exitEvents = collectExitEventsInPeriod(
    tradesWithExitsInPeriod,
    periodStartUtc,
    periodEndExclusiveUtc,
  )
  const pnls = exitEvents.map((e) => e.pnl)
  const totalPnl = pnls.reduce((a, b) => a + b, 0)
  const roiDenom =
    capital0 > 1e-9
      ? capital0
      : journalDepositUsdt > 1e-9
        ? journalDepositUsdt
        : null
  const pnlPercentPeriod = roiDenom != null ? (totalPnl / roiDenom) * 100 : null

  let winCount = 0
  let lossCount = 0
  let breakevenCount = 0
  const wins: number[] = []
  const losses: number[] = []
  let grossProfit = 0
  let grossLoss = 0
  let best: number | null = null
  let worst: number | null = null
  let maxRoi: number | null = null
  let maxDepositRoi: number | null = null
  let maxDailyDepositRoi: number | null = null
  let sumHolding = 0
  let holdingN = 0

  for (const ev of exitEvents) {
    const p = ev.pnl
    if (p > 0) {
      winCount++
      wins.push(p)
      grossProfit += p
    } else if (p < 0) {
      lossCount++
      losses.push(p)
      grossLoss += Math.abs(p)
    } else {
      breakevenCount++
    }
    if (p > 0 && (best == null || p > best)) best = p
    if (p < 0 && (worst == null || p < worst)) worst = p

    const equityBeforeRaw = equityUsdtBeforeExitLeg(
      ev.at,
      allTradesForEquity,
      cfSorted,
      scope,
      journalHasCashflow,
    )
    const equityBefore = Number.isFinite(equityBeforeRaw) ? equityBeforeRaw : 0
    const depositRoiPct = equityBefore > 1e-9 ? (p / equityBefore) * 100 : null
    if (ev.roiLegPct != null && Number.isFinite(ev.roiLegPct)) {
      maxRoi = maxRoi == null ? ev.roiLegPct : Math.max(maxRoi, ev.roiLegPct)
    }
    if (depositRoiPct != null && Number.isFinite(depositRoiPct)) {
      maxDepositRoi =
        maxDepositRoi == null ? depositRoiPct : Math.max(maxDepositRoi, depositRoiPct)
    }

    const t = ev.trade
    if (
      t.status === TradeStatus.CLOSED &&
      t.closedAt &&
      Math.abs(t.closedAt.getTime() - ev.at.getTime()) < 60_000
    ) {
      const j = buildTradeJournalMetrics(t, equityBefore > 1e-9 ? equityBefore : undefined)
      if (j.durationMs != null && j.durationMs >= 0) {
        sumHolding += j.durationMs
        holdingN++
      }
    }
  }

  const closedCount = exitEvents.length
  const winratePercent = closedCount > 0 ? (winCount / closedCount) * 100 : null
  const avgWin = wins.length > 0 ? wins.reduce((a, b) => a + b, 0) / wins.length : null
  const avgLoss = losses.length > 0 ? losses.reduce((a, b) => a + b, 0) / losses.length : null
  const profitFactor = grossLoss > 1e-9 ? grossProfit / grossLoss : grossProfit > 0 ? null : null
  const riskReward =
    avgLoss != null && avgLoss !== 0 && avgWin != null ? avgWin / Math.abs(avgLoss) : null

  const winRateDec = closedCount > 0 ? winCount / closedCount : 0
  const lossRateDec = closedCount > 0 ? lossCount / closedCount : 0
  const expectancyUsdt =
    avgWin != null && avgLoss != null
      ? winRateDec * avgWin + lossRateDec * avgLoss
      : null

  const equityCurve = buildAnalyticsEquityCurveFromExits(
    capital0,
    allTradesForEquity,
    cashflowsInPeriod,
    scope,
    periodStartUtc,
    periodEndExclusiveUtc,
  )
  const { maxDdUsd, peak } = maxDrawdownFromBalances(
    capital0,
    equityCurve.map((p) => p.balanceUsdt),
  )

  const maxDrawdownUsdt = maxDdUsd
  const maxDrawdownPercent = peak > 1e-9 ? (maxDdUsd / peak) * 100 : null
  const recoveryFactor = maxDdUsd > 1e-9 ? totalPnl / maxDdUsd : null

  const dayMap = new Map<string, number>()
  for (const ev of exitEvents) {
    const ymd = formatInTimeZone(ev.at, timeZone, "yyyy-MM-dd")
    dayMap.set(ymd, (dayMap.get(ymd) ?? 0) + ev.pnl)
  }
  const pnlByDay: AnalyticsDayPnlDto[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayYmd, pnlUsdt]) => ({ dayYmd, pnlUsdt }))

  const sharpeRatio = sharpeFromDailyPnls(pnlByDay.map((d) => d.pnlUsdt))

  for (const { dayYmd, pnlUsdt } of pnlByDay) {
    const { start: dayStartUtc } = zonedPeriodHalfOpenUtc(timeZone, dayYmd, dayYmd)
    const equityDayStart = equityUsdtBeforeExitLeg(
      dayStartUtc,
      allTradesForEquity,
      cfSorted,
      scope,
      journalHasCashflow,
    )
    if (equityDayStart > 1e-9) {
      const dayRoi = (pnlUsdt / equityDayStart) * 100
      maxDailyDepositRoi =
        maxDailyDepositRoi == null ? dayRoi : Math.max(maxDailyDepositRoi, dayRoi)
    }
  }

  const stratMap = new Map<string, { pnl: number; count: number; wins: number }>()
  for (const ev of exitEvents) {
    const key = ev.trade.strategy?.trim() || "—"
    const row = stratMap.get(key) ?? { pnl: 0, count: 0, wins: 0 }
    row.pnl += ev.pnl
    row.count++
    if (ev.pnl > 0) row.wins++
    stratMap.set(key, row)
  }
  const strategySlices: AnalyticsStrategySliceDto[] = [...stratMap.entries()].map(([strategy, v]) => ({
    strategy,
    pnlUsdt: v.pnl,
    count: v.count,
    winratePercent: v.count > 0 ? (v.wins / v.count) * 100 : null,
  }))

  const symMap = new Map<string, { pnl: number; count: number }>()
  for (const ev of exitEvents) {
    const row = symMap.get(ev.trade.symbol) ?? { pnl: 0, count: 0 }
    row.pnl += ev.pnl
    row.count++
    symMap.set(ev.trade.symbol, row)
  }
  const symbolSlices: AnalyticsSymbolSliceDto[] = [...symMap.entries()]
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([symbol, v]) => ({ symbol, pnlUsdt: v.pnl, count: v.count }))

  const wdMap = new Map<number, { pnl: number; count: number }>()
  for (const ev of exitEvents) {
    const dow = Number(formatInTimeZone(ev.at, timeZone, "i"))
    const row = wdMap.get(dow) ?? { pnl: 0, count: 0 }
    row.pnl += ev.pnl
    row.count++
    wdMap.set(dow, row)
  }
  const weekdaySlicesFixed: AnalyticsWeekdaySliceDto[] = [...wdMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([weekday, v]) => {
      const labels = ["", "пн", "вт", "ср", "чт", "пт", "сб", "вс"]
      return {
        weekday,
        label: labels[weekday] ?? String(weekday),
        pnlUsdt: v.pnl,
        count: v.count,
      }
    })

  const hourMap = new Map<number, { pnl: number; count: number }>()
  for (const ev of exitEvents) {
    const h = Number(formatInTimeZone(ev.at, timeZone, "H"))
    const row = hourMap.get(h) ?? { pnl: 0, count: 0 }
    row.pnl += ev.pnl
    row.count++
    hourMap.set(h, row)
  }
  const hourSlices: AnalyticsHourSliceDto[] = [...hourMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, v]) => ({ hour, pnlUsdt: v.pnl, count: v.count }))

  const mdMap = new Map<string, { pnl: number; count: number }>()
  for (const ev of exitEvents) {
    const key = `${ev.trade.marketType}_${ev.trade.direction}`
    const row = mdMap.get(key) ?? { pnl: 0, count: 0 }
    row.pnl += ev.pnl
    row.count++
    mdMap.set(key, row)
  }
  const marketDirectionSlices: AnalyticsMarketDirectionSliceDto[] = [...mdMap.entries()].map(
    ([key, v]) => {
      const [marketType, direction] = key.split("_")
      return {
        marketType: marketType ?? "",
        direction: direction ?? "",
        pnlUsdt: v.pnl,
        count: v.count,
      }
    },
  )

  const emEntryMap = new Map<string, { pnl: number; count: number }>()
  const emExitMap = new Map<string, { pnl: number; count: number }>()
  for (const ev of exitEvents) {
    const ek = ev.trade.emotionEntry?.trim() || "—"
    const exk = ev.trade.emotionExit?.trim() || "—"
    const pe = emEntryMap.get(ek) ?? { pnl: 0, count: 0 }
    pe.pnl += ev.pnl
    pe.count++
    emEntryMap.set(ek, pe)
    const px = emExitMap.get(exk) ?? { pnl: 0, count: 0 }
    px.pnl += ev.pnl
    px.count++
    emExitMap.set(exk, px)
  }
  const emotionEntrySlices: AnalyticsEmotionSliceDto[] = [...emEntryMap.entries()].map(
    ([label, v]) => ({ label, pnlUsdt: v.pnl, count: v.count }),
  )
  const emotionExitSlices: AnalyticsEmotionSliceDto[] = [...emExitMap.entries()].map(
    ([label, v]) => ({ label, pnlUsdt: v.pnl, count: v.count }),
  )

  const winLoss: AnalyticsWinLossDto = {
    winTrades: winCount,
    lossTrades: lossCount,
    pnlFromWinsUsdt: wins.reduce((a, b) => a + b, 0),
    pnlFromLossesUsdt: losses.reduce((a, b) => a + b, 0),
  }

  const summary: AnalyticsSummaryDto = {
    totalPnlUsdt: totalPnl,
    pnlPercentPeriod,
    capitalAtPeriodStartUsdt: capital0,
    journalDepositUsdt,
    closedCount,
    winCount,
    lossCount,
    breakevenCount,
    winratePercent,
    avgWinUsdt: avgWin,
    avgLossUsdt: avgLoss,
    profitFactor,
    riskReward,
    grossProfitUsdt: grossProfit,
    grossLossUsdt: grossLoss,
    bestTradePnlUsdt: best,
    worstTradePnlUsdt: worst,
    maxTradeRoiPercent: maxRoi,
    maxDepositRoiPercent: maxDepositRoi,
    maxDailyDepositRoiPercent: maxDailyDepositRoi,
    sharpeRatio,
    maxDrawdownUsdt,
    maxDrawdownPercent,
    expectancyUsdt,
    recoveryFactor,
    avgHoldingMs: holdingN > 0 ? sumHolding / holdingN : null,
  }

  return {
    timeZone,
    fromYmd,
    toYmd,
    journalAllAccounts,
    accountId,
    symbolFilter,
    strategyFilter,
    marketTypeFilter,
    summary,
    equityCurve,
    pnlByDay,
    strategySlices,
    histogram: buildHistogram(pnls),
    symbolSlices,
    weekdaySlices: weekdaySlicesFixed,
    hourSlices,
    marketDirectionSlices,
    emotionEntrySlices,
    emotionExitSlices,
    winLoss,
  }
}
