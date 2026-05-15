import { TradeStatus, type Trade, type Entry, type Exit } from "@prisma/client"
import {
  calculateTradePnL,
  calculateRealizedPnL,
  calculateVolumes,
} from "@/server/trading/trade-pnl"
import { pnlRoiForExitLeg } from "@/lib/exit-leg-pnl"
import type { ExitLegJournalDto, TradeJournalMetricsDto } from "@/contracts/trades"

export { JOURNAL_INITIAL_DEPOSIT_USDT } from "@/server/trading/equity-constants"

export type TradeWithLegs = Trade & { entries: Entry[]; exits: Exit[] }

export type ExitWithLegJournal = Exit & { legJournal: ExitLegJournalDto }

export type TradeWithJournal = Trade & {
  entries: Entry[]
  exits: ExitWithLegJournal[]
  journal: TradeJournalMetricsDto
}

export function buildTradeJournalMetrics(t: TradeWithLegs): TradeJournalMetricsDto {
  const { entryVolume, exitVolume, remainingVolume } = calculateVolumes(t)
  const maxLeverage = t.entries.reduce((m, e) => Math.max(m, e.leverage ?? 0), 0)
  const avgEntry =
    entryVolume > 0
      ? t.entries.reduce((s, e) => s + e.price * e.volume, 0) / entryVolume
      : null
  const avgExit =
    exitVolume > 0
      ? t.exits.reduce((s, e) => s + e.price * e.volume, 0) / exitVolume
      : null

  const fullPnl = calculateTradePnL(t)
  const realized = calculateRealizedPnL(t)

  let displayPnl: number | null
  if (t.status === TradeStatus.CLOSED) {
    displayPnl = fullPnl
  } else {
    displayPnl = exitVolume > 0 ? realized : null
  }

  const entryValue = t.entries.reduce((s, e) => s + e.price * e.volume, 0)
  let tradeRoiPct: number | null = null
  if (t.status === TradeStatus.CLOSED && entryValue > 0) {
    tradeRoiPct = (fullPnl / entryValue) * 100
  }

  let durationMs: number | null = null
  if (t.status === TradeStatus.CLOSED && t.closedAt) {
    const entryTimes = t.entries.map((e) => e.timestamp.getTime())
    const t0 = Math.min(t.createdAt.getTime(), ...(entryTimes.length ? entryTimes : [t.createdAt.getTime()]))
    durationMs = t.closedAt.getTime() - t0
    if (!Number.isFinite(durationMs) || durationMs < 0) durationMs = null
  }

  return {
    entryVolume,
    exitVolume,
    remainingVolume,
    avgEntry,
    avgExit,
    maxLeverage,
    displayPnl,
    tradeRoiPct,
    durationMs,
  }
}

export function buildExitLegJournal(t: TradeWithLegs, exit: Exit): ExitLegJournalDto {
  return pnlRoiForExitLeg(t.direction, t.entries, exit)
}

export function attachJournalToTradesList(trades: TradeWithLegs[]): TradeWithJournal[] {
  return trades.map((t) => {
    const journal = buildTradeJournalMetrics(t)
    const exits: ExitWithLegJournal[] = t.exits.map((ex) => ({
      ...ex,
      legJournal: buildExitLegJournal(t, ex),
    }))
    return { ...t, entries: t.entries, exits, journal }
  })
}
