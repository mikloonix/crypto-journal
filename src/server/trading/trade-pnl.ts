import type { Entry, Exit, Trade } from "@prisma/client"
import {
  contractQtyFromExitMargin,
  contractQtyFromMargin,
  sumEntryMarginUsdt,
  sumExitMarginUsdt,
  tradeLeverageFromEntries,
  weightedAvgEntryPrice,
} from "@/server/trading/position-margin"

/** Единый расчёт PnL по сделке (fee/funding на уровне Trade). volume = маржа USDT. */
export function calculateTradePnL(trade: Trade & { entries: Entry[]; exits: Exit[] }): number {
  const lev = tradeLeverageFromEntries(trade.entries)
  const avgEntry = weightedAvgEntryPrice(trade.entries)

  let entryValue = 0
  for (const e of trade.entries) {
    const q = contractQtyFromMargin(e.volume, e.price, e.leverage)
    entryValue += q * e.price
  }

  let exitValue = 0
  for (const x of trade.exits) {
    const q = contractQtyFromExitMargin(x.volume, avgEntry, lev)
    exitValue += q * x.price
  }

  let pnl = exitValue - entryValue
  if (trade.direction === "SHORT") {
    pnl = -pnl
  }

  pnl -= trade.fee
  pnl -= trade.funding

  return pnl
}

export function calculateVolumes(trade: { entries: Entry[]; exits: Exit[] }) {
  const entryVolume = sumEntryMarginUsdt(trade.entries)
  const exitVolume = sumExitMarginUsdt(trade.exits)
  const remainingVolume = entryVolume - exitVolume
  return { entryVolume, exitVolume, remainingVolume }
}

/** Realized PnL для частично закрытой позиции (пропорционально fee/funding). */
export function calculateRealizedPnL(
  trade: Trade & { entries: Entry[]; exits: Exit[] },
): number {
  const { entryVolume, exitVolume } = calculateVolumes(trade)
  if (exitVolume <= 0 || entryVolume <= 0) return 0

  const lev = tradeLeverageFromEntries(trade.entries)
  const avgEntry = weightedAvgEntryPrice(trade.entries)
  if (avgEntry <= 0) return 0

  let exitQty = 0
  for (const x of trade.exits) {
    exitQty += contractQtyFromExitMargin(x.volume, avgEntry, lev)
  }
  if (exitQty <= 0 || avgEntry <= 0) return 0

  let exitValue = 0
  for (const x of trade.exits) {
    const q = contractQtyFromExitMargin(x.volume, avgEntry, lev)
    exitValue += q * x.price
  }
  const avgExit = exitValue / exitQty

  let pnl = (avgExit - avgEntry) * exitQty
  if (trade.direction === "SHORT") pnl = -pnl

  const ratio = Math.min(1, exitVolume / entryVolume)
  pnl -= trade.fee * ratio
  pnl -= trade.funding * ratio

  return pnl
}
