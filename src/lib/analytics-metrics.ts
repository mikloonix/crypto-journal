/**
 * Агрегаты аналитики (этап 3). Единая точка расчётов; UI не дублирует.
 */

import { TradeStatus, type Cashflow } from "@prisma/client"
import { formatInTimeZone } from "date-fns-tz"
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
import { calculateTradePnL } from "@/server/trading/trade-pnl"
import {
  buildTradeJournalMetrics,
  type TradeWithLegs,
} from "@/server/trading/journal-metrics"
import {
  buildAnalyticsEquityCurve,
  capitalUsdtBeforeExclusive,
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

export function pnlForClosedTrade(t: TradeWithLegs): number {
  return calculateTradePnL(toLegs(t))
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

export type BuildAnalyticsInput = {
  timeZone: string
  fromYmd: string
  toYmd: string
  journalAllAccounts: boolean
  accountId: string | null
  symbolFilter: string | null
  strategyFilter: string | null
  marketTypeFilter: string | null
  tradesClosedStrictlyBeforeStart: TradeWithLegs[]
  tradesClosedInPeriod: TradeWithLegs[]
  /** Cashflow до начала периода (тот же скоуп журнала). */
  cashflowsStrictlyBeforeStart: Cashflow[]
  cashflowsInPeriod: Cashflow[]
  /** Есть ли у пользователя хотя бы одна cashflow-запись в скоупе журнала. */
  journalHasCashflow: boolean
  /** Начало периода (UTC), для capital0. */
  periodStartUtc: Date
  /** DEP/WITH без accountId — привязка к дефолтному счёту (скоуп журнала). */
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
    tradesClosedStrictlyBeforeStart,
    tradesClosedInPeriod,
    cashflowsStrictlyBeforeStart,
    cashflowsInPeriod,
    journalHasCashflow,
    periodStartUtc,
    legacyCashflowAccountId,
  } = input

  const scope: JournalEquityScope = {
    journalAllAccounts,
    journalAccountId: accountId ?? undefined,
    ...(legacyCashflowAccountId ? { legacyCashflowAccountId } : {}),
  }
  const capital0Raw = capitalUsdtBeforeExclusive(
    periodStartUtc,
    tradesClosedStrictlyBeforeStart,
    cashflowsStrictlyBeforeStart,
    scope,
    journalHasCashflow,
  )
  const capital0 = Number.isFinite(capital0Raw) ? capital0Raw : JOURNAL_INITIAL_DEPOSIT_USDT

  const allCashflows = [...cashflowsStrictlyBeforeStart, ...cashflowsInPeriod]
  const netCfAll = netCashflowPortfolioUsdt(allCashflows, scope)
  const journalDepositUsdt = journalHasCashflow
    ? Math.max(Number.isFinite(netCfAll) ? netCfAll : 0, 0)
    : JOURNAL_INITIAL_DEPOSIT_USDT

  const period = tradesClosedInPeriod
    .filter((t) => t.status === TradeStatus.CLOSED && t.closedAt != null)
    .slice()
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime())

  const pnls = period.map((t) => pnlForClosedTrade(t))
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
  let sumHolding = 0
  let holdingN = 0

  for (let i = 0; i < period.length; i++) {
    const p = pnls[i]!
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

    const j = buildTradeJournalMetrics(toLegs(period[i]!), journalDepositUsdt)
    if (j.tradeRoiPct != null && Number.isFinite(j.tradeRoiPct)) {
      maxRoi = maxRoi == null ? j.tradeRoiPct : Math.max(maxRoi, j.tradeRoiPct)
    }
    if (journalDepositUsdt > 0) {
      const dr = (p / journalDepositUsdt) * 100
      maxDepositRoi = maxDepositRoi == null ? dr : Math.max(maxDepositRoi, dr)
    }
    if (j.durationMs != null && j.durationMs >= 0) {
      sumHolding += j.durationMs
      holdingN++
    }
  }

  const closedCount = period.length
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

  const equityCurve = buildAnalyticsEquityCurve(
    capital0,
    tradesClosedInPeriod,
    cashflowsInPeriod,
    scope,
  )
  const { maxDdUsd, peak } = maxDrawdownFromBalances(
    capital0,
    equityCurve.map((p) => p.balanceUsdt),
  )

  const maxDrawdownUsdt = maxDdUsd
  const maxDrawdownPercent = peak > 1e-9 ? (maxDdUsd / peak) * 100 : null
  const recoveryFactor = maxDdUsd > 1e-9 ? totalPnl / maxDdUsd : null

  const dayMap = new Map<string, number>()
  for (let i = 0; i < period.length; i++) {
    const t = period[i]!
    const ymd = formatInTimeZone(new Date(t.closedAt!), timeZone, "yyyy-MM-dd")
    dayMap.set(ymd, (dayMap.get(ymd) ?? 0) + pnls[i]!)
  }
  const pnlByDay: AnalyticsDayPnlDto[] = [...dayMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dayYmd, pnlUsdt]) => ({ dayYmd, pnlUsdt }))

  const sharpeRatio = sharpeFromDailyPnls(pnlByDay.map((d) => d.pnlUsdt))

  const stratMap = new Map<string, { pnl: number; count: number; wins: number }>()
  for (let i = 0; i < period.length; i++) {
    const t = period[i]!
    const key = t.strategy?.trim() || "—"
    const row = stratMap.get(key) ?? { pnl: 0, count: 0, wins: 0 }
    row.pnl += pnls[i]!
    row.count++
    if (pnls[i]! > 0) row.wins++
    stratMap.set(key, row)
  }
  const strategySlices: AnalyticsStrategySliceDto[] = [...stratMap.entries()].map(([strategy, v]) => ({
    strategy,
    pnlUsdt: v.pnl,
    count: v.count,
    winratePercent: v.count > 0 ? (v.wins / v.count) * 100 : null,
  }))

  const symMap = new Map<string, { pnl: number; count: number }>()
  for (let i = 0; i < period.length; i++) {
    const t = period[i]!
    const row = symMap.get(t.symbol) ?? { pnl: 0, count: 0 }
    row.pnl += pnls[i]!
    row.count++
    symMap.set(t.symbol, row)
  }
  const symbolSlices: AnalyticsSymbolSliceDto[] = [...symMap.entries()]
    .sort((a, b) => b[1].pnl - a[1].pnl)
    .map(([symbol, v]) => ({ symbol, pnlUsdt: v.pnl, count: v.count }))

  const wdMap = new Map<number, { pnl: number; count: number }>()
  for (let i = 0; i < period.length; i++) {
    const t = period[i]!
    const dow = Number(formatInTimeZone(new Date(t.closedAt!), timeZone, "i"))
    const row = wdMap.get(dow) ?? { pnl: 0, count: 0 }
    row.pnl += pnls[i]!
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
  for (let i = 0; i < period.length; i++) {
    const t = period[i]!
    const h = Number(formatInTimeZone(new Date(t.closedAt!), timeZone, "H"))
    const row = hourMap.get(h) ?? { pnl: 0, count: 0 }
    row.pnl += pnls[i]!
    row.count++
    hourMap.set(h, row)
  }
  const hourSlices: AnalyticsHourSliceDto[] = [...hourMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, v]) => ({ hour, pnlUsdt: v.pnl, count: v.count }))

  const mdMap = new Map<string, { pnl: number; count: number }>()
  for (let i = 0; i < period.length; i++) {
    const t = period[i]!
    const key = `${t.marketType}_${t.direction}`
    const row = mdMap.get(key) ?? { pnl: 0, count: 0 }
    row.pnl += pnls[i]!
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
  for (let i = 0; i < period.length; i++) {
    const t = period[i]!
    const ek = t.emotionEntry?.trim() || "—"
    const exk = t.emotionExit?.trim() || "—"
    const pe = emEntryMap.get(ek) ?? { pnl: 0, count: 0 }
    pe.pnl += pnls[i]!
    pe.count++
    emEntryMap.set(ek, pe)
    const px = emExitMap.get(exk) ?? { pnl: 0, count: 0 }
    px.pnl += pnls[i]!
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
