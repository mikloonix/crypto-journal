import type { Prisma } from "@prisma/client"
import { TradeStatus } from "@prisma/client"

export function sumEntryVolume(trade: { entries: { volume: number }[] }): number {
  return trade.entries.reduce((s, e) => s + e.volume, 0)
}

export function sumExitVolume(trade: { exits: { volume: number }[] }): number {
  return trade.exits.reduce((s, e) => s + e.volume, 0)
}

export function isFullyClosed(entryVol: number, exitVolAfter: number): boolean {
  if (entryVol <= 0) return false
  const remaining = entryVol - exitVolAfter
  const tol = Math.max(1e-6, entryVol * 1e-8)
  return remaining <= tol
}

/** После удаления/восстановления выхода — статус, closedAt, emotionExit по активным выходам. */
export async function syncTradeMetaFromActiveExits(
  tx: Prisma.TransactionClient,
  tradeId: string,
): Promise<void> {
  const t = await tx.trade.findUniqueOrThrow({
    where: { id: tradeId },
    include: {
      entries: true,
      exits: { where: { deletedAt: null } },
    },
  })
  const entryVol = sumEntryVolume(t)
  const exitVol = sumExitVolume(t)
  const fully = isFullyClosed(entryVol, exitVol)
  const sorted = [...t.exits].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
  const last = sorted[sorted.length - 1]
  await tx.trade.update({
    where: { id: tradeId },
    data: {
      status: fully ? TradeStatus.CLOSED : TradeStatus.OPEN,
      closedAt: fully && last ? last.timestamp : null,
      emotionExit: last?.emotionExit ?? null,
    },
  })
}
