import type {
  EntryDto,
  ExitDto,
  TradeListItemDto,
  LiquidityRoleDto,
  MarketTypeDto,
  DirectionDto,
  TradeStatusDto,
  ExitLegJournalDto,
} from "@/contracts/trades"
import type { TradeWithJournal } from "./journal-metrics"
import type { Exit as PrismaExit } from "@prisma/client"

function liquidityRole(x: string): LiquidityRoleDto {
  return x === "MAKER" ? "MAKER" : "TAKER"
}

export function serializeExitDto(ex: PrismaExit, legJournal: ExitLegJournalDto): ExitDto {
  return {
    id: ex.id,
    tradeId: ex.tradeId,
    price: ex.price,
    volume: ex.volume,
    timestamp: ex.timestamp.toISOString(),
    emotionExit: ex.emotionExit,
    fee: ex.fee,
    funding: ex.funding,
    liquidityRole: liquidityRole(ex.liquidityRole),
    deletedAt: ex.deletedAt?.toISOString() ?? null,
    legJournal,
  }
}

export function serializeTradeListItem(t: TradeWithJournal): TradeListItemDto {
  const entries: EntryDto[] = t.entries.map((e) => ({
    id: e.id,
    tradeId: e.tradeId,
    price: e.price,
    volume: e.volume,
    leverage: e.leverage ?? null,
    timestamp: e.timestamp.toISOString(),
    fee: e.fee,
    liquidityRole: liquidityRole(e.liquidityRole),
  }))

  const exits: ExitDto[] = t.exits.map((ex) => serializeExitDto(ex, ex.legJournal))

  return {
    id: t.id,
    userId: t.userId,
    symbol: t.symbol,
    marketType: t.marketType as MarketTypeDto,
    direction: t.direction as DirectionDto,
    status: t.status as TradeStatusDto,
    strategy: t.strategy,
    emotionEntry: t.emotionEntry,
    emotionExit: t.emotionExit,
    notes: t.notes,
    fee: t.fee,
    funding: t.funding,
    createdAt: t.createdAt.toISOString(),
    closedAt: t.closedAt?.toISOString() ?? null,
    updatedAt: t.updatedAt.toISOString(),
    deletedAt: t.deletedAt?.toISOString() ?? null,
    entries,
    exits,
    journal: t.journal,
  }
}
