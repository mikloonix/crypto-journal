export type CashflowTypeDto = "DEPOSIT" | "WITHDRAWAL" | "TRANSFER"

export type CashflowDto = {
  id: string
  userId: string
  type: CashflowTypeDto
  accountId: string | null
  fromAccountId: string | null
  toAccountId: string | null
  amount: number
  currency: string
  fxRate: number | null
  fee: number | null
  /** Сумма операции в USDT (по полю amount × fx). */
  amountBodyUsdt: number
  /** Комиссия в USDT. */
  feeUsdt: number
  timestamp: string
  note: string | null
}

export type CashflowListResponseDto = {
  cashflows: CashflowDto[]
  summary: {
    netFlowPeriodUsdt: number
    /** Оценка equity (cashflow + закрытый PnL) в скоупе журнала. */
    balanceEstimateUsdt: number
    totalPnlClosedUsdt: number
  }
}
