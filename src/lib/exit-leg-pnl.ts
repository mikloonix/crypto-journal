import type { Direction, Entry, Exit } from "@prisma/client"

function weightedAvgEntry(entries: Pick<Entry, "price" | "volume">[]): number {
  const vol = entries.reduce((s, e) => s + e.volume, 0)
  if (vol <= 0) return 0
  return entries.reduce((s, e) => s + e.price * e.volume, 0) / vol
}

/** Упрощённый PnL и ROI по одному выходу: к средневзвешенному входу всего трейда, минус fee/funding этого выхода. */
export function pnlRoiForExitLeg(
  direction: Direction,
  entries: Pick<Entry, "price" | "volume">[],
  exit: Pick<Exit, "price" | "volume" | "fee" | "funding">,
): { pnl: number; roiPct: number } {
  const avgEntry = weightedAvgEntry(entries)
  if (avgEntry <= 0 || exit.volume <= 0) return { pnl: 0, roiPct: 0 }

  let gross = (exit.price - avgEntry) * exit.volume
  if (direction === "SHORT") gross = -gross

  const pnl = gross - (exit.fee ?? 0) - (exit.funding ?? 0)
  const notional = exit.price * exit.volume
  const roiPct = notional > 0 ? (pnl / notional) * 100 : 0
  return { pnl, roiPct }
}
