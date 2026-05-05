import { prisma } from "@/lib/prisma"

export const trashRepository = {
  listDeletedTrades(userId: string) {
    return prisma.trade.findMany({
      where: { userId, deletedAt: { not: null } },
      orderBy: { deletedAt: "desc" },
      include: { entries: true, exits: true },
    })
  },

  listDeletedExitsForActiveTrades(userId: string) {
    return prisma.exit.findMany({
      where: {
        deletedAt: { not: null },
        trade: { userId, deletedAt: null },
      },
      orderBy: { deletedAt: "desc" },
      include: {
        trade: {
          include: {
            entries: true,
            exits: { where: { deletedAt: null } },
          },
        },
      },
    })
  },
}
