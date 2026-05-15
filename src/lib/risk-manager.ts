import { Entry, RiskSettings } from "@prisma/client"
import { formatDecimal, formatPercent } from "./format-amount"
import {
  contractQtyFromMargin,
  notionalFromMarginUsdt,
  weightedAvgEntryPrice,
} from "@/server/trading/position-margin"

export type { Trade } from "@prisma/client"
export {
  calculateTradePnL,
  calculateVolumes,
  calculateRealizedPnL,
} from "@/server/trading/trade-pnl"

export interface RiskCheckResult {
  isValid: boolean
  warnings: string[]
  riskAmount: number
  riskPercent: number
}

export function calculateRiskForTrade(
  entries: Entry[],
  stopLossPrice: number,
  settings: RiskSettings,
): RiskCheckResult {
  const avgEntry = weightedAvgEntryPrice(entries)
  const contractVol = entries.reduce(
    (s, e) => s + contractQtyFromMargin(e.volume, e.price, e.leverage),
    0,
  )

  const priceDiff = Math.abs(avgEntry - stopLossPrice)
  const riskAmount = priceDiff * contractVol
  const balance = settings.accountBalance > 0 ? settings.accountBalance : 1
  const riskPercent = (riskAmount / balance) * 100

  const warnings: string[] = []

  if (riskPercent > settings.riskPerTrade) {
    warnings.push(
      `⚠️ Риск ${formatPercent(riskPercent)}% превышает лимит ${settings.riskPerTrade}%`,
    )
  }

  const maxRiskUsdt = notionalFromMarginUsdt(balance, 1) * 0.1
  if (riskAmount > maxRiskUsdt) {
    warnings.push(`⚠️ Сумма риска ${formatDecimal(riskAmount)} превышает 10% депозита`)
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    riskAmount,
    riskPercent,
  }
}
