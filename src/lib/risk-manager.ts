import { Trade, Entry, Exit, RiskSettings } from "@prisma/client"
import { formatDecimal, formatPercent } from "./format-amount"

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
    warnings.push(
      `⚠️ Риск ${formatPercent(riskPercent)}% превышает лимит ${settings.riskPerTrade}%`
    )
  }
  
  if (riskAmount > settings.accountBalance * 0.1) {
    warnings.push(`⚠️ Сумма риска ${formatDecimal(riskAmount)} превышает 10% депозита`)
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

  if (trade.direction === "SHORT") {
    pnl = -pnl
  }

  pnl -= trade.fee
  pnl -= trade.funding

  return pnl
}

export function calculateVolumes(trade: { entries: Entry[]; exits: Exit[] }) {
  const entryVolume = trade.entries.reduce((s, e) => s + e.volume, 0)
  const exitVolume = trade.exits.reduce((s, e) => s + e.volume, 0)
  const remainingVolume = entryVolume - exitVolume
  return { entryVolume, exitVolume, remainingVolume }
}

/**
 * Realized PnL for the closed portion (partial exits).
 * Uses weighted-average entry cost, then applies direction.
 * Fee/funding are allocated proportionally to realized volume.
 */
export function calculateRealizedPnL(
  trade: Trade & { entries: Entry[]; exits: Exit[] }
): number {
  const { entryVolume, exitVolume } = calculateVolumes(trade)
  if (exitVolume <= 0 || entryVolume <= 0) return 0

  const entryValue = trade.entries.reduce((sum, e) => sum + e.price * e.volume, 0)
  const exitValue = trade.exits.reduce((sum, e) => sum + e.price * e.volume, 0)

  const avgEntry = entryValue / entryVolume
  const avgExit = exitValue / exitVolume

  let pnl = (avgExit - avgEntry) * exitVolume
  if (trade.direction === "SHORT") pnl = -pnl

  const ratio = Math.min(1, exitVolume / entryVolume)
  pnl -= trade.fee * ratio
  pnl -= trade.funding * ratio

  return pnl
}