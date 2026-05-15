import type { Cashflow } from "@prisma/client"
import type { CashflowDto } from "@/contracts/cashflow"
import {
  cashflowAmountBodyUsdt,
  cashflowFeeUsdt,
  cashflowNetEffectUsdtRow,
} from "@/server/trading/cashflow-usdt"

export function serializeCashflow(row: Cashflow): CashflowDto {
  const body = cashflowAmountBodyUsdt(row)
  const feeU = cashflowFeeUsdt(row)
  return {
    id: row.id,
    userId: row.userId,
    type: row.type as CashflowDto["type"],
    accountId: row.accountId,
    fromAccountId: row.fromAccountId,
    toAccountId: row.toAccountId,
    amount: row.amount,
    currency: row.currency,
    fxRate: row.fxRate,
    fee: row.fee,
    amountBodyUsdt: Number.isFinite(body) ? body : 0,
    feeUsdt: Number.isFinite(feeU) ? feeU : 0,
    netEffectUsdt: (() => {
      const n = cashflowNetEffectUsdtRow(row)
      return Number.isFinite(n) ? n : 0
    })(),
    timestamp: row.timestamp.toISOString(),
    note: row.note,
  }
}
