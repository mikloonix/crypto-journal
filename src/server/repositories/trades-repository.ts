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

  if (filters.dateFrom || filters.dateTo) {
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

  findFirstActiveWithLegs(userId: string, tradeId: string) {
    return prisma.trade.findFirst({
      where: { id: tradeId, ...whereActiveTrades(userId) },
      include: tradeIncludeActive,
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
