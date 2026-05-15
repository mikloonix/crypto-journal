import type { Direction, Entry, Exit } from "@prisma/client"
import {
  contractQtyFromExitMargin,
  sumEntryMarginUsdt,
  tradeLeverageFromEntries,
  weightedAvgEntryPrice,
} from "@/server/trading/position-margin"

/** PnL и ROI по одному выходу (volume = маржа USDT). */
export function pnlRoiForExitLeg(
  direction: Direction,
  entries: Pick<Entry, "price" | "volume" | "leverage" | "fee">[],
  exit: Pick<Exit, "price" | "volume" | "fee" | "funding">,
): { pnl: number; roiPct: number } {
  const avgEntry = weightedAvgEntryPrice(entries)
  const lev = tradeLeverageFromEntries(entries)
  const exitQty = contractQtyFromExitMargin(exit.volume, avgEntry, lev)
  if (avgEntry <= 0 || exitQty <= 0) return { pnl: 0, roiPct: 0 }

  let gross = (exit.price - avgEntry) * exitQty
  if (direction === "SHORT") gross = -gross

  const entryMargin = sumEntryMarginUsdt(entries)
  const entryFees = entries.reduce((s, e) => s + (e.fee ?? 0), 0)
  const allocEntryFee =
    entryMargin > 0 ? entryFees * (exit.volume / entryMargin) : 0

  const pnl = gross - (exit.fee ?? 0) - (exit.funding ?? 0) - allocEntryFee
  const roiPct = exit.volume > 0 ? (pnl / exit.volume) * 100 : 0
  return { pnl, roiPct }
}
