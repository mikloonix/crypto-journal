export type RiskSettingsDto = {
  accountBalance: number
  riskPerTrade: number
  riskPerDay: number
  maxDrawdown: number
  maxOpenRisk: number
  /** Этап 4.5 — цель по депозиту (USDT); null — не задано. */
  forecastDepositTargetUsdt: number | null
  forecastPlanDepositTargetUsdt: number | null
  /** ROI % на сделку (онлайн). */
  forecastTradeRoiPercent: number | null
  /** ROI % на сделку (план). */
  forecastPlanTradeRoiPercent: number | null
  /** Календарный дедлайн `yyyy-MM-dd` в displayTimeZone пользователя. */
  forecastDeadlineYmd: string | null
  /** Старт онлайн-прогноза; null — все сделки журнала. */
  forecastStartedAtYmd: string | null
  /** Депозит на старт онлайн-прогноза. */
  forecastStartEquityUsdt: number | null
}

export type RiskSettingsBalanceSyncDto = {
  balanceEstimateUsdt: number
  totalPnlClosedUsdt: number
  openCount: number
}

export type TradeRiskStatusDto = "OK" | "HIGH" | "NA"

export type TradeRiskDto = {
  status: TradeRiskStatusDto
  riskUsdt: number | null
  riskPct: number | null
  reasons: string[]
}

export type JournalRiskSummaryDto = {
  openRiskUsdt: number
  openRiskPctSum: number
  dailyRealizedLossUsdt: number
  dailyUnrealizedLossUsdt: number | null
  dailyRiskUsedPct: number
  drawdownPct: number | null
  peakEquityUsdt: number | null
  warnings: string[]
  hasMarkPrices: boolean
}

export type RiskEvaluateBodyDto = {
  markPrices?: Record<string, number>
  markPricesByTradeId?: Record<string, number>
}

export type RiskEvaluateResponseDto = {
  summary: JournalRiskSummaryDto
  openTrades: Array<{
    tradeId: string
    symbol: string
    risk: TradeRiskDto
  }>
}
