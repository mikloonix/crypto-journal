/** Этап 3 — аналитика закрытых сделок (серверный DTO). */

export type AnalyticsSummaryDto = {
  totalPnlUsdt: number
  /** (PnL периода / капитал на T_start) × 100; null если капитал ≤ 0 */
  pnlPercentPeriod: number | null
  capitalAtPeriodStartUsdt: number
  closedCount: number
  winCount: number
  lossCount: number
  breakevenCount: number
  winratePercent: number | null
  avgWinUsdt: number | null
  avgLossUsdt: number | null
  profitFactor: number | null
  riskReward: number | null
  grossProfitUsdt: number
  grossLossUsdt: number
  bestTradePnlUsdt: number | null
  worstTradePnlUsdt: number | null
  maxTradeRoiPercent: number | null
  sharpeRatio: number | null
  maxDrawdownUsdt: number
  maxDrawdownPercent: number | null
  expectancyUsdt: number | null
  recoveryFactor: number | null
  avgHoldingMs: number | null
}

export type AnalyticsEquityPointDto = {
  index: number
  closedAt: string
  pnlUsdt: number
  cumulativePnlUsdt: number
  balanceUsdt: number
}

export type AnalyticsDayPnlDto = {
  dayYmd: string
  pnlUsdt: number
}

export type AnalyticsStrategySliceDto = {
  strategy: string
  pnlUsdt: number
  count: number
  winratePercent: number | null
}

export type AnalyticsHistogramBinDto = {
  binStart: number
  binEnd: number
  count: number
}

export type AnalyticsSymbolSliceDto = {
  symbol: string
  pnlUsdt: number
  count: number
}

export type AnalyticsWeekdaySliceDto = {
  weekday: number
  label: string
  pnlUsdt: number
  count: number
}

export type AnalyticsHourSliceDto = {
  hour: number
  pnlUsdt: number
  count: number
}

export type AnalyticsMarketDirectionSliceDto = {
  marketType: string
  direction: string
  pnlUsdt: number
  count: number
}

export type AnalyticsEmotionSliceDto = {
  label: string
  pnlUsdt: number
  count: number
}

export type AnalyticsWinLossDto = {
  winTrades: number
  lossTrades: number
  pnlFromWinsUsdt: number
  pnlFromLossesUsdt: number
}

export type AnalyticsSnapshotDto = {
  timeZone: string
  fromYmd: string
  toYmd: string
  journalAllAccounts: boolean
  accountId: string | null
  symbolFilter: string | null
  strategyFilter: string | null
  marketTypeFilter: string | null
  summary: AnalyticsSummaryDto
  equityCurve: AnalyticsEquityPointDto[]
  pnlByDay: AnalyticsDayPnlDto[]
  strategySlices: AnalyticsStrategySliceDto[]
  histogram: AnalyticsHistogramBinDto[]
  symbolSlices: AnalyticsSymbolSliceDto[]
  weekdaySlices: AnalyticsWeekdaySliceDto[]
  hourSlices: AnalyticsHourSliceDto[]
  marketDirectionSlices: AnalyticsMarketDirectionSliceDto[]
  emotionEntrySlices: AnalyticsEmotionSliceDto[]
  emotionExitSlices: AnalyticsEmotionSliceDto[]
  winLoss: AnalyticsWinLossDto
}
