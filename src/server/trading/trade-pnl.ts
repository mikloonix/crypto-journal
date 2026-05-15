import type { Entry, Exit, Trade } from "@prisma/client"

/** Единый расчёт PnL по сделке (fee/funding на уровне Trade). */
export function calculateTradePnL(trade: Trade & { entries: Entry[]; exits: Exit[] }): number {
  const totalEntryValue = trade.entries.reduce((sum, e) => sum + e.price * e.volume, 0)
  const totalExitValue = trade.exits.reduce((sum, e) => sum + e.price * e.volume, 0)

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

/** Realized PnL для частично закрытой позиции (пропорционально fee/funding). */
export function calculateRealizedPnL(
  trade: Trade & { entries: Entry[]; exits: Exit[] },
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
