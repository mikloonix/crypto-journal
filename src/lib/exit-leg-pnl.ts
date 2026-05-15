import type { Direction, Entry, Exit } from "@prisma/client"
import {
  contractQtyFromMargin,
  tradeLeverageFromEntries,
  weightedAvgEntryPrice,
} from "@/server/trading/position-margin"

/** PnL и ROI по одному выходу (volume = маржа USDT). */
export function pnlRoiForExitLeg(
  direction: Direction,
  entries: Pick<Entry, "price" | "volume" | "leverage">[],
  exit: Pick<Exit, "price" | "volume" | "fee" | "funding">,
): { pnl: number; roiPct: number } {
  const avgEntry = weightedAvgEntryPrice(entries)
  const lev = tradeLeverageFromEntries(entries)
  const exitQty = contractQtyFromMargin(exit.volume, exit.price, lev)
  if (avgEntry <= 0 || exitQty <= 0) return { pnl: 0, roiPct: 0 }

  let gross = (exit.price - avgEntry) * exitQty
  if (direction === "SHORT") gross = -gross

  const pnl = gross - (exit.fee ?? 0) - (exit.funding ?? 0)
  const notional = exit.volume * lev
  const roiPct = notional > 0 ? (pnl / notional) * 100 : 0
  return { pnl, roiPct }
}
