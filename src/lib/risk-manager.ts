import { Entry, Exit, RiskSettings } from "@prisma/client"
import { formatDecimal, formatPercent } from "./format-amount"

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
  const totalVolume = entries.reduce((sum, e) => sum + e.volume, 0)
  const avgEntryPrice = entries.reduce((sum, e) => sum + e.price * e.volume, 0) / totalVolume

  const priceDiff = Math.abs(avgEntryPrice - stopLossPrice)
  const riskAmount = priceDiff * totalVolume
  const riskPercent = (riskAmount / settings.accountBalance) * 100

  const warnings: string[] = []

  if (riskPercent > settings.riskPerTrade) {
    warnings.push(
      `⚠️ Риск ${formatPercent(riskPercent)}% превышает лимит ${settings.riskPerTrade}%`,
    )
  }

  if (riskAmount > settings.accountBalance * 0.1) {
    warnings.push(`⚠️ Сумма риска ${formatDecimal(riskAmount)} превышает 10% депозита`)
  }

  return {
    isValid: warnings.length === 0,
    warnings,
    riskAmount,
    riskPercent,
  }
}
