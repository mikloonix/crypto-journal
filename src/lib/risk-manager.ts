import { Trade, Entry, Exit, RiskSettings } from "@prisma/client"

export interface RiskCheckResult {
  isValid: boolean
  warnings: string[]
  riskAmount: number
  riskPercent: number
}

export function calculateRiskForTrade(
  entries: Entry[],
  stopLossPrice: number,
  settings: RiskSettings
): RiskCheckResult {
  const totalVolume = entries.reduce((sum, e) => sum + e.volume, 0)
  const avgEntryPrice = entries.reduce((sum, e) => sum + e.price * e.volume, 0) / totalVolume
  
  const priceDiff = Math.abs(avgEntryPrice - stopLossPrice)
  const riskAmount = priceDiff * totalVolume
  const riskPercent = (riskAmount / settings.accountBalance) * 100
  
  const warnings: string[] = []
  
  if (riskPercent > settings.riskPerTrade) {
    warnings.push(`⚠️ Риск ${riskPercent.toFixed(2)}% превышает лимит ${settings.riskPerTrade}%`)
  }
  
  if (riskAmount > settings.accountBalance * 0.1) {
    warnings.push(`⚠️ Сумма риска $${riskAmount.toFixed(2)} превышает 10% депозита`)
  }
  
  return {
    isValid: warnings.length === 0,
    warnings,
    riskAmount,
    riskPercent
  }
}

export function calculateTradePnL(trade: Trade & { entries: Entry[]; exits: Exit[] }): number {
  const totalEntryValue = trade.entries.reduce((sum, e) => sum + (e.price * e.volume), 0)
  const totalExitValue = trade.exits.reduce((sum, e) => sum + (e.price * e.volume), 0)
  
  let pnl = totalExitValue - totalEntryValue
  
  if (trade.direction === 'SHORT') {
    pnl = -pnl
  }
  
  pnl -= trade.fee
  pnl -= trade.funding
  
  return pnl
}