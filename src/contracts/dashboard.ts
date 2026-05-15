/** Этап 2.6 — дашборд: дневной PnL и контекст усреднения (MVP). */

export type DashboardDayStatsDto = {
  pnlUsdt: number
  /** Количество выходов (ног) за день, не число закрытых трейдов целиком. */
  closedCount: number
  /** ROI за день = PnL дня / капитал на начало дня × 100; null если база ≤ 0. */
  roiDayPercent: number | null
  /** Капитал на начало календарного дня (cashflow + закрытый PnL до dayStart). */
  balanceAtDayStartUsdt: number
  displayCurrency: "USDT"
}

export type QuoteSourceDto = "manual" | "exchange"

export type AveragingPositionContextDto = {
  tradeId: string
  symbol: string
  direction: "LONG" | "SHORT"
  avgEntry: number
  leverage: number
  entryVolume: number
  safeZoneLow: number
  safeZoneHigh: number
}

export type AveragingContextDto = {
  quoteSource: Extract<QuoteSourceDto, "manual">
  riskPerTrade: number
  riskPerDay: number
  accountBalance: number
  positions: AveragingPositionContextDto[]
}

export type AveragingInputPerTradeDto = {
  priceNow: number | null
  price1hAgo: number | null
  stopPrice: number | null
}

export type AveragingComputedRowDto = {
  tradeId: string
  symbol: string
  direction: "LONG" | "SHORT"
  avgEntry: number
  leverage: number
  safeZoneLow: number
  safeZoneHigh: number
  /** Без цены сейчас — null. */
  pullbackPercent: number | null
  hourlyReturnPercent: number | null
  suggestedMarginAddUsdt: number | null
  warnings: string[]
}

export type AveragingComputeResultDto = {
  rows: AveragingComputedRowDto[]
}
