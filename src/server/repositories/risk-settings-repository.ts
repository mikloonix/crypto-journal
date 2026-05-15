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
      activeAccountId?: string | null
      journalAllAccounts?: boolean
      displayTimeZone?: string
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

  patchRiskLimits(
    userId: string,
    update: {
      accountBalance?: number
      riskPerTrade?: number
      riskPerDay?: number
      maxDrawdown?: number
      maxOpenRisk?: number
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

  setActiveAccountId(userId: string, activeAccountId: string | null) {
    return prisma.riskSettings.upsert({
      where: { userId },
      update: { activeAccountId },
      create: {
        userId,
        ...riskSettingsCreateDefaults,
        activeAccountId,
      },
    })
  },
}
