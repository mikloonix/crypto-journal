import type { TrashItemDto } from "@/contracts/trades"
import { trashRepository } from "@/server/repositories/trash-repository"
import {
  attachJournalToTradesList,
  buildExitLegJournal,
  type TradeWithLegs,
} from "@/server/trading/journal-metrics"
import { serializeTradeListItem, serializeExitDto } from "@/server/trading/serialize-trade"
import { tradesRepository } from "@/server/repositories/trades-repository"
import { exitRepository } from "@/server/repositories/exit-repository"

function toLegs(row: Parameters<typeof attachJournalToTradesList>[0][number]): TradeWithLegs {
  return {
    ...row,
    exits: row.exits.filter((e) => e.deletedAt == null),
  }
}

export const trashService = {
  async getTrash(userId: string): Promise<TrashItemDto> {
    const [deletedTrades, deletedExits] = await Promise.all([
      trashRepository.listDeletedTrades(userId),
      trashRepository.listDeletedExitsForActiveTrades(userId),
    ])

    const tradeDtos = deletedTrades.map((t) => {
      const legs = toLegs(t)
      const one = attachJournalToTradesList([legs])[0]!
      return serializeTradeListItem(one)
    })

    const exitRows: TrashItemDto["deletedExits"] = deletedExits.map((row) => {
      const tradePrisma = row.trade
      const legs: TradeWithLegs = {
        ...tradePrisma,
        exits: tradePrisma.exits.filter((e) => e.deletedAt == null),
      }
      const tradeWithJ = attachJournalToTradesList([legs])[0]!
      const tradeDto = serializeTradeListItem(tradeWithJ)
      const tForLeg = {
        ...tradePrisma,
        entries: tradePrisma.entries,
        exits: [row],
      } as TradeWithLegs
      const legJournal = buildExitLegJournal(tForLeg, row)
      const exitDto = serializeExitDto(row, legJournal)
      return { exit: exitDto, trade: tradeDto }
    })

    return { deletedTrades: tradeDtos, deletedExits: exitRows }
  },

  async restore(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; mode: "trade" | "exit" }
    | { ok: false; error: string; status: number }
  > {
    const tradeId = body.tradeId != null && body.tradeId !== "" ? String(body.tradeId) : ""
    const exitId = body.exitId != null && body.exitId !== "" ? String(body.exitId) : ""

    if (!tradeId && !exitId) {
      return { ok: false, error: "Нужен tradeId или exitId", status: 400 }
    }

    if (exitId) {
      const r = await exitRepository.restoreExit(userId, exitId)
      if (!r.ok) {
        return { ok: false, error: "Not found", status: 404 }
      }
      return { ok: true, mode: "exit" }
    }

    const n = await tradesRepository.restoreTrade(userId, tradeId)
    if (n.count === 0) {
      return { ok: false, error: "Not found", status: 404 }
    }
    return { ok: true, mode: "trade" }
  },
}
