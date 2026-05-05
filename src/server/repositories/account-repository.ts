import { AccountSource } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { riskSettingsCreateDefaults } from "@/server/risk-defaults"

export const accountRepository = {
  listByUser(userId: string) {
    return prisma.account.findMany({
      where: { userId },
      orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    })
  },

  findFirst(userId: string, accountId: string) {
    return prisma.account.findFirst({
      where: { id: accountId, userId },
    })
  },

  countTradesForAccount(userId: string, accountId: string) {
    return prisma.trade.count({
      where: { userId, accountId, deletedAt: null },
    })
  },

  /**
   * Создаёт счёт «без привязки» при отсутствии, чинит битый activeAccountId,
   * проставляет accountId на старых трейдах (этап 2.5).
   */
  async ensureDefaultAndBackfill(userId: string) {
    return prisma.$transaction(async (tx) => {
      let accounts = await tx.account.findMany({
        where: { userId },
        orderBy: [{ isDefault: "desc" }, { name: "asc" }],
      })
      let defaultAcc = accounts.find((a) => a.isDefault) ?? accounts[0]

      const legacyDefault = accounts.find((a) => a.isDefault && a.name === "Основной")
      if (legacyDefault) {
        await tx.account.update({
          where: { id: legacyDefault.id },
          data: { name: "без привязки" },
        })
        accounts = await tx.account.findMany({
          where: { userId },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        })
        defaultAcc = accounts.find((a) => a.isDefault) ?? accounts[0]
      }

      if (!defaultAcc) {
        await tx.account.create({
          data: {
            userId,
            name: "без привязки",
            isDefault: true,
            source: AccountSource.MANUAL,
          },
        })
        accounts = await tx.account.findMany({
          where: { userId },
          orderBy: [{ isDefault: "desc" }, { name: "asc" }],
        })
        defaultAcc = accounts.find((a) => a.isDefault) ?? accounts[0]!
      }

      const accountIds = new Set(accounts.map((a) => a.id))
      const rs = await tx.riskSettings.findUnique({ where: { userId } })

      if (!rs) {
        await tx.riskSettings.create({
          data: {
            userId,
            ...riskSettingsCreateDefaults,
            activeAccountId: defaultAcc.id,
          },
        })
      } else {
        const active = rs.activeAccountId
        const needsFix = !active || !accountIds.has(active)
        if (needsFix) {
          await tx.riskSettings.update({
            where: { userId },
            data: { activeAccountId: defaultAcc.id },
          })
        }
      }

      await tx.trade.updateMany({
        where: { userId, accountId: null, deletedAt: null },
        data: { accountId: defaultAcc.id },
      })

      return accounts
    })
  },

  create(userId: string, name: string, source: AccountSource = AccountSource.MANUAL) {
    return prisma.account.create({
      data: { userId, name: name.trim(), isDefault: false, source },
    })
  },

  async setDefault(userId: string, accountId: string) {
    return prisma.$transaction(async (tx) => {
      const acc = await tx.account.findFirst({ where: { id: accountId, userId } })
      if (!acc) return null
      await tx.account.updateMany({
        where: { userId },
        data: { isDefault: false },
      })
      return tx.account.update({
        where: { id: accountId },
        data: { isDefault: true },
      })
    })
  },

  updateFields(
    userId: string,
    accountId: string,
    data: { name?: string; source?: AccountSource },
  ) {
    return prisma.account.updateMany({
      where: { id: accountId, userId },
      data,
    })
  },

  deleteIfEmpty(userId: string, accountId: string) {
    return prisma.$transaction(async (tx) => {
      const n = await tx.trade.count({
        where: { userId, accountId, deletedAt: null },
      })
      if (n > 0) return { ok: false as const, reason: "HAS_TRADES" }
      const acc = await tx.account.findFirst({ where: { id: accountId, userId } })
      if (!acc) return { ok: false as const, reason: "NOT_FOUND" }
      await tx.riskSettings.updateMany({
        where: { userId, activeAccountId: accountId },
        data: { activeAccountId: null },
      })
      await tx.account.delete({ where: { id: accountId } })
      return { ok: true as const }
    })
  },
}
