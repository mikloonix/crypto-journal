import { CashflowType, type Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"

function journalScopeWhere(
  journalAllAccounts: boolean,
  journalAccountId: string | undefined,
  legacyCashflowAccountId?: string | undefined,
): Prisma.CashflowWhereInput {
  if (journalAllAccounts) return {}
  if (!journalAccountId) return {}

  const depositWithdrawClause: Prisma.CashflowWhereInput =
    legacyCashflowAccountId === journalAccountId
      ? {
          AND: [
            { type: { in: [CashflowType.DEPOSIT, CashflowType.WITHDRAWAL] } },
            { OR: [{ accountId: journalAccountId }, { accountId: null }] },
          ],
        }
      : {
          type: { in: [CashflowType.DEPOSIT, CashflowType.WITHDRAWAL] },
          accountId: journalAccountId,
        }

  return {
    OR: [
      depositWithdrawClause,
      {
        type: CashflowType.TRANSFER,
        OR: [{ fromAccountId: journalAccountId }, { toAccountId: journalAccountId }],
      },
    ],
  }
}

export type CashflowCreateInput = {
  userId: string
  type: CashflowType
  accountId?: string | null
  fromAccountId?: string | null
  toAccountId?: string | null
  amount: number
  currency: string
  fxRate?: number | null
  fee?: number | null
  timestamp: Date
  note?: string | null
}

export const cashflowRepository = {
  listForJournalScope(
    userId: string,
    journalAllAccounts: boolean,
    journalAccountId: string | undefined,
    legacyCashflowAccountId?: string | undefined,
  ) {
    return prisma.cashflow.findMany({
      where: {
        userId,
        ...journalScopeWhere(journalAllAccounts, journalAccountId, legacyCashflowAccountId),
      },
      orderBy: { timestamp: "asc" },
    })
  },

  listInRange(
    userId: string,
    startUtc: Date,
    endExclusiveUtc: Date,
    journalAllAccounts: boolean,
    journalAccountId: string | undefined,
    legacyCashflowAccountId?: string | undefined,
  ) {
    return prisma.cashflow.findMany({
      where: {
        userId,
        timestamp: { gte: startUtc, lt: endExclusiveUtc },
        ...journalScopeWhere(journalAllAccounts, journalAccountId, legacyCashflowAccountId),
      },
      orderBy: { timestamp: "asc" },
    })
  },

  listBefore(
    userId: string,
    beforeUtc: Date,
    journalAllAccounts: boolean,
    journalAccountId: string | undefined,
    legacyCashflowAccountId?: string | undefined,
  ) {
    return prisma.cashflow.findMany({
      where: {
        userId,
        timestamp: { lt: beforeUtc },
        ...journalScopeWhere(journalAllAccounts, journalAccountId, legacyCashflowAccountId),
      },
      orderBy: { timestamp: "asc" },
    })
  },

  /** Портфель: все операции пользователя с опциональным фильтром по счёту (как журнал). */
  listForPortfolio(
    userId: string,
    journalAllAccounts: boolean,
    journalAccountId: string | undefined,
    range?: { fromUtc?: Date; toUtc?: Date },
    legacyCashflowAccountId?: string | undefined,
  ) {
    const time: Prisma.DateTimeFilter = {}
    if (range?.fromUtc) time.gte = range.fromUtc
    if (range?.toUtc) time.lte = range.toUtc
    const hasTime = range?.fromUtc != null || range?.toUtc != null
    return prisma.cashflow.findMany({
      where: {
        userId,
        ...(hasTime ? { timestamp: time } : {}),
        ...journalScopeWhere(journalAllAccounts, journalAccountId, legacyCashflowAccountId),
      },
      orderBy: { timestamp: "desc" },
    })
  },

  findFirst(userId: string, id: string) {
    return prisma.cashflow.findFirst({ where: { id, userId } })
  },

  create(data: CashflowCreateInput) {
    return prisma.cashflow.create({
      data: {
        userId: data.userId,
        type: data.type,
        accountId: data.accountId ?? null,
        fromAccountId: data.fromAccountId ?? null,
        toAccountId: data.toAccountId ?? null,
        amount: data.amount,
        currency: data.currency,
        fxRate: data.fxRate ?? null,
        fee: data.fee ?? null,
        timestamp: data.timestamp,
        note: data.note ?? null,
      },
    })
  },

  async update(userId: string, id: string, data: Prisma.CashflowUncheckedUpdateInput) {
    const row = await prisma.cashflow.findFirst({ where: { id, userId } })
    if (!row) return null
    return prisma.cashflow.update({ where: { id }, data })
  },

  async delete(userId: string, id: string) {
    const r = await prisma.cashflow.deleteMany({ where: { id, userId } })
    return r.count
  },
}
