import type { Prisma } from "@prisma/client"

/** Активные трейды и выходы (не в корзине). */
export const tradeIncludeActive = {
  entries: true,
  exits: { where: { deletedAt: null } },
} satisfies Prisma.TradeInclude

export function whereActiveTrades(userId: string): Prisma.TradeWhereInput {
  return { userId, deletedAt: null }
}
