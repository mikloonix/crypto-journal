import { prisma } from "@/lib/prisma"
import { syncTradeMetaFromActiveExits } from "@/lib/trade-volumes"

export const exitRepository = {
  async softDeleteExit(userId: string, tradeId: string, exitId: string) {
    const txResult = await prisma.$transaction(async (tx) => {
      const row = await tx.exit.findFirst({
        where: { id: exitId, tradeId, deletedAt: null },
        include: { trade: true },
      })
      if (!row || row.trade.userId !== userId || row.trade.deletedAt != null) {
        return { ok: false as const }
      }
      await tx.exit.update({
        where: { id: exitId },
        data: { deletedAt: new Date() },
      })
      await tx.trade.update({
        where: { id: tradeId },
        data: {
          fee: { decrement: row.fee },
          funding: { decrement: row.funding },
        },
      })
      await syncTradeMetaFromActiveExits(tx, tradeId)
      return { ok: true as const }
    })
    return txResult
  },

  async restoreExit(userId: string, exitId: string) {
    const txResult = await prisma.$transaction(async (tx) => {
      const row = await tx.exit.findFirst({
        where: { id: exitId, deletedAt: { not: null } },
        include: { trade: true },
      })
      if (!row || row.trade.userId !== userId || row.trade.deletedAt != null) {
        return { ok: false as const }
      }
      const tid = row.tradeId
      await tx.exit.update({
        where: { id: exitId },
        data: { deletedAt: null },
      })
      await tx.trade.update({
        where: { id: tid },
        data: {
          fee: { increment: row.fee },
          funding: { increment: row.funding },
        },
      })
      await syncTradeMetaFromActiveExits(tx, tid)
      return { ok: true as const }
    })
    return txResult
  },
}
