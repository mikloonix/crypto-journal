export type RiskSettingsDto = {
  accountBalance: number
  riskPerTrade: number
  riskPerDay: number
  maxDrawdown: number
  maxOpenRisk: number
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
