/** Сериализованные сущности журнала (даты — ISO-строки после JSON). */

export type LiquidityRoleDto = "MAKER" | "TAKER"
export type DirectionDto = "LONG" | "SHORT"
export type TradeStatusDto = "OPEN" | "CLOSED"
export type MarketTypeDto = "SPOT" | "FUTURE"

export type EntryDto = {
  id: string
  tradeId: string
  price: number
  volume: number
  leverage: number | null
  timestamp: string
  fee: number
  liquidityRole: LiquidityRoleDto
}

export type ExitLegJournalDto = {
  pnl: number
  roiPct: number
}

export type ExitDto = {
  id: string
  tradeId: string
  price: number
  volume: number
  timestamp: string
  emotionExit: string | null
  fee: number
  funding: number
  liquidityRole: LiquidityRoleDto
  deletedAt: string | null
  legJournal: ExitLegJournalDto
}

export type TradeJournalMetricsDto = {
  entryVolume: number
  exitVolume: number
  remainingVolume: number
  avgEntry: number | null
  avgExit: number | null
  maxLeverage: number
  displayPnl: number | null
  tradeRoiPct: number | null
  /** Длительность от первого события (createdAt/entry) до closedAt; только для CLOSED */
  durationMs: number | null
}

export type EquityCurvePointDto = {
  tradeIndex: number
  balance: number
  pnl: number
  roi: number
  event?: "trade" | "cashflow"
}

export type JournalSummaryDto = {
  initialDepositUsdt: number
  balanceEstimateUsdt: number
  totalPnlClosedUsdt: number
  roiPercent: number
  openCount: number
  equityCurve: EquityCurvePointDto[]
}

export type TradeListItemDto = {
  id: string
  userId: string
  accountId: string | null
  symbol: string
  marketType: MarketTypeDto
  direction: DirectionDto
  status: TradeStatusDto
  strategy: string | null
  emotionEntry: string | null
  emotionExit: string | null
  notes: string | null
  fee: number
  funding: number
  createdAt: string
  closedAt: string | null
  updatedAt: string
  deletedAt: string | null
  entries: EntryDto[]
  exits: ExitDto[]
  journal: TradeJournalMetricsDto
}

export type TradesJournalListDto = {
  trades: TradeListItemDto[]
  summary: JournalSummaryDto
}

export type TradingDefaultsDto = {
  defaultFeeUsdt: number
  makerFeeBps: number
  takerFeeBps: number
  bingxVipTier: number
  maxLeverage: number
  /** Активный счёт для ввода сделок и журнала (этап 2.5) */
  activeAccountId: string | null
  /** Журнал по всем счетам (шапка «Все счета») */
  journalAllAccounts: boolean
  /** IANA timezone для аналитики и календарного дня (этап 3) */
  displayTimeZone: string
}

/** Корзина: у удалённого выхода `trade` без этого выхода в `exits` — для legJournal собирается на сервере. */
export type TrashExitRowDto = {
  exit: ExitDto
  trade: TradeListItemDto
}

export type TrashItemDto = {
  deletedTrades: TradeListItemDto[]
  deletedExits: TrashExitRowDto[]
}

export type DeleteTradeResultDto = { mode: "trade" | "exit" }

export type RestoreTradeResultDto = { mode: "trade" | "exit" }
