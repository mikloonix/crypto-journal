import { prisma } from "@/lib/prisma"
import { riskSettingsCreateDefaults } from "@/server/risk-defaults"

export const riskSettingsRepository = {
  upsertDefaults(userId: string) {
    return prisma.riskSettings.upsert({
      where: { userId },
      update: {},
      create: {
        userId,
        ...riskSettingsCreateDefaults,
      },
    })
  },

  upsertWithUpdate(
    userId: string,
    update: {
      defaultFeeUsdt?: number
      makerFeeBps?: number
      takerFeeBps?: number
      bingxVipTier?: number
    },
  ) {
    return prisma.riskSettings.upsert({
      where: { userId },
      update,
      create: {
        userId,
        ...riskSettingsCreateDefaults,
        ...update,
      },
    })
  },
}
