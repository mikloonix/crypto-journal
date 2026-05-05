import { TradeStatus, type Trade, type Entry, type Exit } from "@prisma/client"
import {
  calculateTradePnL,
  calculateRealizedPnL,
  calculateVolumes,
} from "@/lib/risk-manager"
import { pnlRoiForExitLeg } from "@/lib/exit-leg-pnl"
import type {
  EquityCurvePointDto,
  ExitLegJournalDto,
  JournalSummaryDto,
  TradeJournalMetricsDto,
} from "@/contracts/trades"

/** Единая константа для equity/карточек журнала до появления портфеля (этап 3.5). */
export const JOURNAL_INITIAL_DEPOSIT_USDT = 1000

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

export function buildJournalSummary(trades: TradeWithLegs[]): JournalSummaryDto {
  const initial = JOURNAL_INITIAL_DEPOSIT_USDT
  const closed = trades.filter((t) => t.status === TradeStatus.CLOSED && t.closedAt != null)
  let totalPnlClosed = 0
  for (const t of closed) {
    totalPnlClosed += calculateTradePnL(t)
  }
  const balance = initial + totalPnlClosed
  const roiPercent = (totalPnlClosed / initial) * 100
  const openCount = trades.filter((t) => t.status === TradeStatus.OPEN).length

  const sorted = closed
    .slice()
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime())

  let running = initial
  const equityCurve: EquityCurvePointDto[] = sorted.map((t, i) => {
    const pnl = calculateTradePnL(t)
    running += pnl
    const roi = ((running - initial) / initial) * 100
    return {
      tradeIndex: i + 1,
      balance: running,
      pnl,
      roi,
    }
  })

  return {
    initialDepositUsdt: initial,
    balanceEstimateUsdt: balance,
    totalPnlClosedUsdt: totalPnlClosed,
    roiPercent,
    openCount,
    equityCurve,
  }
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
