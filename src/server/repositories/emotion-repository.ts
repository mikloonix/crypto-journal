import { prisma } from "@/lib/prisma"

export const emotionRepository = {
  listByUser(userId: string) {
    return prisma.emotion.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    })
  },

  create(userId: string, name: string) {
    return prisma.emotion.create({
      data: { userId, name: name.trim(), sortOrder: 0 },
    })
  },

  async update(userId: string, id: string, data: { name?: string; sortOrder?: number }) {
    const one = await prisma.emotion.findFirst({ where: { id, userId } })
    if (!one) return null
    return prisma.emotion.update({
      where: { id },
      data,
    })
  },

  delete(userId: string, id: string) {
    return prisma.emotion.deleteMany({
      where: { id, userId },
    })
  },
}
