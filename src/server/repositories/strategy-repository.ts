import { prisma } from "@/lib/prisma"

export const strategyRepository = {
  listByUser(userId: string) {
    return prisma.strategy.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })
  },

  create(
    userId: string,
    data: {
      name: string
      timeframe?: string | null
      setup?: string | null
      riskNote?: string | null
    },
  ) {
    return prisma.strategy.create({
      data: {
        userId,
        name: data.name.trim(),
        sortOrder: 0,
        timeframe: data.timeframe?.trim() ? data.timeframe.trim() : null,
        setup: data.setup?.trim() ? data.setup.trim() : null,
        riskNote: data.riskNote?.trim() ? data.riskNote.trim() : null,
      },
    })
  },

  async update(
    userId: string,
    id: string,
    data: {
      name?: string
      sortOrder?: number
      timeframe?: string | null
      setup?: string | null
      riskNote?: string | null
    },
  ) {
    const one = await prisma.strategy.findFirst({ where: { id, userId } })
    if (!one) return null
    return prisma.strategy.update({
      where: { id },
      data,
    })
  },

  delete(userId: string, id: string) {
    return prisma.strategy.deleteMany({
      where: { id, userId },
    })
  },
}
