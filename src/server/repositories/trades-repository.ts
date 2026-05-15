import {
  type Prisma,
  TradeStatus,
  type Direction,
  type LiquidityRole,
  type MarketType,
} from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { tradeIncludeActive, whereActiveTrades } from "@/lib/trade-scope"
import { isFullyClosed, sumExitVolume } from "@/lib/trade-volumes"
import type { JournalListFilters } from "@/server/trades/journal-list-query"

function journalScopeWhere(
  journalAllAccounts: boolean,
  journalAccountId: string | undefined,
): Prisma.TradeWhereInput {
  if (journalAllAccounts) return {}
  if (journalAccountId) return { accountId: journalAccountId }
  return {}
}

function buildJournalListWhere(userId: string, filters: JournalListFilters): Prisma.TradeWhereInput {
  const w: Prisma.TradeWhereInput = { ...whereActiveTrades(userId) }
  if (filters.status) w.status = filters.status
  if (filters.symbol) {
    w.symbol = { contains: filters.symbol, mode: "insensitive" }
  }
  if (filters.strategy) {
    w.strategy = { contains: filters.strategy, mode: "insensitive" }
  }
  if (filters.marketType) w.marketType = filters.marketType

  if (filters.dateField === "exitAt") {
    const some: Prisma.ExitWhereInput = { deletedAt: null }
    if (filters.dateFrom || filters.dateTo) {
      some.timestamp = {}
      if (filters.dateFrom) some.timestamp.gte = filters.dateFrom
      if (filters.dateTo) some.timestamp.lte = filters.dateTo
    }
    w.exits = { some }
  } else if (filters.dateFrom || filters.dateTo) {
    if (filters.dateField === "closedAt") {
      const range: Prisma.DateTimeNullableFilter = {}
      if (filters.dateFrom) range.gte = filters.dateFrom
      if (filters.dateTo) range.lte = filters.dateTo
      w.closedAt = range
    } else {
      const range: Prisma.DateTimeFilter = {}
      if (filters.dateFrom) range.gte = filters.dateFrom
      if (filters.dateTo) range.lte = filters.dateTo
      w.createdAt = range
    }
  }
  if (filters.accountId) {
    w.accountId = filters.accountId
  }
  return w
}

export const tradesRepository = {
  distinctSymbols(userId: string, status?: TradeStatus) {
    return prisma.trade.findMany({
      where: {
        ...whereActiveTrades(userId),
        ...(status ? { status } : {}),
      },
      select: { symbol: true },
      distinct: ["symbol"],
      orderBy: { symbol: "asc" },
    }).then((rows) => rows.map((r) => r.symbol))
  },

  distinctStrategies(userId: string, status?: TradeStatus) {
    return prisma.trade.findMany({
      where: {
        ...whereActiveTrades(userId),
        ...(status ? { status } : {}),
        strategy: { not: null },
      },
      select: { strategy: true },
      distinct: ["strategy"],
      orderBy: { strategy: "asc" },
    }).then((rows) =>
      rows.map((r) => r.strategy).filter((s): s is string => s != null && s !== ""),
    )
  },

  findManyActiveWithLegs(userId: string) {
    return prisma.trade.findMany({
      where: whereActiveTrades(userId),
      orderBy: { createdAt: "desc" },
      include: tradeIncludeActive,
    })
  },

  findManyActiveWithLegsFiltered(userId: string, filters: JournalListFilters) {
    return prisma.trade.findMany({
      where: buildJournalListWhere(userId, filters),
      orderBy: { createdAt: "desc" },
      include: tradeIncludeActive,
    })
  },

  /** Все закрытые сделки для equity / summary (скоуп журнала), без фильтров таблицы. */
  findClosedWithLegsForJournalScope(
    userId: string,
    journalAllAccounts: boolean,
    journalAccountId: string | undefined,
  ) {
    const scope = journalScopeWhere(journalAllAccounts, journalAccountId)
    return prisma.trade.findMany({
      where: {
        ...whereActiveTrades(userId),
        ...scope,
        status: TradeStatus.CLOSED,
        closedAt: { not: null },
      },
      orderBy: { closedAt: "asc" },
      include: tradeIncludeActive,
    })
  },

  /** [closedAt start, closedAt end) — локальный день в UTC-инстантах с клиента. */
  findClosedTradesClosedAtHalfOpenRange(
    userId: string,
    startUtc: Date,
    endExclusiveUtc: Date,
    accountId?: string,
  ) {
    return prisma.trade.findMany({
      where: {
        ...whereActiveTrades(userId),
        status: TradeStatus.CLOSED,
        closedAt: { gte: startUtc, lt: endExclusiveUtc },
        ...(accountId ? { accountId } : {}),
      },
      orderBy: { closedAt: "desc" },
      include: tradeIncludeActive,
    })
  },

  /** Выходы (ноги) с временем в [start, endExclusive); для дневной сводки и PnL по сделкам-выходам. */
  findExitsInTimestampHalfOpenRange(
    userId: string,
    startUtc: Date,
    endExclusiveUtc: Date,
    accountId?: string,
  ) {
    return prisma.exit.findMany({
      where: {
        deletedAt: null,
        timestamp: { gte: startUtc, lt: endExclusiveUtc },
        trade: {
          ...whereActiveTrades(userId),
          ...(accountId ? { accountId } : {}),
        },
      },
      include: {
        trade: { include: tradeIncludeActive },
      },
      orderBy: { timestamp: "desc" },
    })
  },

  /** Закрытые до начала периода — для капитала на T_start (без фильтров символа/стратегии). */
  findClosedTradesClosedBefore(
    userId: string,
    periodStartUtc: Date,
    journalAllAccounts: boolean,
    journalAccountId: string | undefined,
  ) {
    const scope = journalScopeWhere(journalAllAccounts, journalAccountId)
    return prisma.trade.findMany({
      where: {
        ...whereActiveTrades(userId),
        ...scope,
        status: TradeStatus.CLOSED,
        /** `lt` в SQL не матчит NULL — отдельный `not: null` с `lt` в одном объекте ломает Prisma. */
        closedAt: { lt: periodStartUtc },
      },
      orderBy: { closedAt: "asc" },
      include: tradeIncludeActive,
    })
  },

  /** Закрытые в [start, endExclusive) с фильтрами аналитики и скоупом журнала. */
  findClosedTradesAnalyticsPeriod(
    userId: string,
    startUtc: Date,
    endExclusiveUtc: Date,
    journalAllAccounts: boolean,
    journalAccountId: string | undefined,
    filters: { symbol?: string; strategy?: string; marketType?: MarketType },
  ) {
    const scope = journalScopeWhere(journalAllAccounts, journalAccountId)
    const w: Prisma.TradeWhereInput = {
      ...whereActiveTrades(userId),
      ...scope,
      status: TradeStatus.CLOSED,
      closedAt: { gte: startUtc, lt: endExclusiveUtc },
    }
    if (filters.symbol?.trim()) {
      w.symbol = { contains: filters.symbol.trim(), mode: "insensitive" }
    }
    if (filters.strategy?.trim()) {
      w.strategy = { contains: filters.strategy.trim(), mode: "insensitive" }
    }
    if (filters.marketType) {
      w.marketType = filters.marketType
    }
    return prisma.trade.findMany({
      where: w,
      orderBy: { closedAt: "asc" },
      include: tradeIncludeActive,
    })
  },

  findOpenTradesWithLegs(userId: string, accountId?: string) {
    return prisma.trade.findMany({
      where: {
        ...whereActiveTrades(userId),
        status: TradeStatus.OPEN,
        ...(accountId ? { accountId } : {}),
      },
      orderBy: { createdAt: "desc" },
      include: tradeIncludeActive,
    })
  },

  findFirstActiveWithLegs(userId: string, tradeId: string) {
    return prisma.trade.findFirst({
      where: { id: tradeId, ...whereActiveTrades(userId) },
      include: tradeIncludeActive,
    })
  },

  patchTradeFields(
    userId: string,
    tradeId: string,
    data: { stopLossPrice?: number | null },
  ) {
    return prisma.trade.updateMany({
      where: { id: tradeId, ...whereActiveTrades(userId) },
      data,
    })
  },

  findOpenTradeId(
    userId: string,
    accountId: string,
    symbol: string,
    direction: Direction,
    marketType: MarketType,
  ) {
    return prisma.trade.findFirst({
      where: {
        ...whereActiveTrades(userId),
        accountId,
        symbol,
        direction,
        marketType,
        status: TradeStatus.OPEN,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    })
  },

  updateTradeAddEntry(params: {
    tradeId: string
    strategy?: string
    emotionEntry?: string
    notes?: string
    entryFee: number
    entryCreate: {
      price: number
      volume: number
      fee: number
      liquidityRole: LiquidityRole
      leverage?: number
    }
  }) {
    const { tradeId, strategy, emotionEntry, notes, entryFee, entryCreate } = params
    return prisma.trade.update({
      where: { id: tradeId },
      data: {
        strategy,
        emotionEntry,
        notes,
        fee: { increment: entryFee },
        entries: { create: entryCreate },
      },
      include: tradeIncludeActive,
    })
  },

  createTradeWithEntry(params: {
    userId: string
    accountId: string
    symbol: string
    marketType: MarketType
    direction: Direction
    strategy?: string
    emotionEntry?: string
    notes?: string
    entryFee: number
    openingFunding: number
    stopLossPrice?: number | null
    entryCreate: {
      price: number
      volume: number
      fee: number
      liquidityRole: LiquidityRole
      leverage?: number
    }
  }) {
    const {
      userId,
      accountId,
      symbol,
      marketType,
      direction,
      strategy,
      emotionEntry,
      notes,
      entryFee,
      openingFunding,
      stopLossPrice,
      entryCreate,
    } = params
    return prisma.trade.create({
      data: {
        userId,
        accountId,
        symbol,
        marketType,
        direction,
        strategy,
        emotionEntry,
        notes,
        fee: entryFee,
        funding: openingFunding,
        ...(stopLossPrice != null && stopLossPrice > 0 ? { stopLossPrice } : {}),
        entries: { create: entryCreate },
      },
      include: tradeIncludeActive,
    })
  },

  /**
   * Создаёт Exit и обновляет статус трейда; `entryVol` — суммарная маржа входов до операции (как в прежнем API).
   */
  async addExitAndRefreshTrade(userId: string, params: {
    tradeId: string
    entryVolume: number
    exitPrice: number
    exitVolume: number
    exitFee: number
    exitFunding: number
    emotionExit: string | null
    liquidityRole: LiquidityRole
  }) {
    const {
      tradeId,
      entryVolume,
      exitPrice,
      exitVolume,
      exitFee,
      exitFunding,
      emotionExit,
      liquidityRole,
    } = params

    await prisma.$transaction(async (tx) => {
      await tx.exit.create({
        data: {
          tradeId,
          price: exitPrice,
          volume: exitVolume,
          emotionExit,
          fee: exitFee,
          funding: exitFunding,
          liquidityRole,
        },
      })

      const fresh = await tx.trade.findUniqueOrThrow({
        where: { id: tradeId },
        include: tradeIncludeActive,
      })

      const ev = sumExitVolume(fresh)
      const actuallyClosed = isFullyClosed(entryVolume, ev)

      await tx.trade.update({
        where: { id: tradeId },
        data: {
          status: actuallyClosed ? TradeStatus.CLOSED : TradeStatus.OPEN,
          closedAt: actuallyClosed ? new Date() : null,
          emotionExit: emotionExit ?? fresh.emotionExit,
          fee: { increment: exitFee },
          funding: { increment: exitFunding },
        },
      })
    })

    return prisma.trade.findFirst({
      where: { id: tradeId, ...whereActiveTrades(userId) },
      include: tradeIncludeActive,
    })
  },

  softDeleteTrade(userId: string, tradeId: string) {
    return prisma.trade.updateMany({
      where: {
        id: tradeId,
        userId,
        deletedAt: null,
      },
      data: { deletedAt: new Date() },
    })
  },

  restoreTrade(userId: string, tradeId: string) {
    return prisma.trade.updateMany({
      where: {
        id: tradeId,
        userId,
        deletedAt: { not: null },
      },
      data: { deletedAt: null },
    })
  },
}
