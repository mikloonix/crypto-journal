import { TradeStatus, type Trade, type Entry, type Exit } from "@prisma/client"
import {
  calculateTradePnL,
  calculateRealizedPnL,
  calculateVolumes,
} from "@/server/trading/trade-pnl"
import { pnlRoiForExitLeg } from "@/lib/exit-leg-pnl"
import {
  contractQtyFromMargin,
  entryLegsNotionalUsdt,
  tradeLeverageFromEntries,
  weightedAvgEntryPrice,
} from "@/server/trading/position-margin"
import type { TradeRiskDto } from "@/contracts/risk"
import { defaultTradeRisk } from "@/server/trading/attach-journal-risk"
import type { ExitLegJournalDto, TradeJournalMetricsDto } from "@/contracts/trades"

export { JOURNAL_INITIAL_DEPOSIT_USDT } from "@/server/trading/equity-constants"

export type TradeWithLegs = Trade & { entries: Entry[]; exits: Exit[] }

export type ExitWithLegJournal = Exit & { legJournal: ExitLegJournalDto }

export type TradeWithJournal = Trade & {
  entries: Entry[]
  exits: ExitWithLegJournal[]
  journal: TradeJournalMetricsDto
  risk: TradeRiskDto
}

export function buildTradeJournalMetrics(t: TradeWithLegs): TradeJournalMetricsDto {
  const { entryVolume, exitVolume, remainingVolume } = calculateVolumes(t)
  const maxLeverage = tradeLeverageFromEntries(t.entries)
  const avgEntry = entryVolume > 0 ? weightedAvgEntryPrice(t.entries) : null
  const lev = maxLeverage
  let avgExit: number | null = null
  if (exitVolume > 0) {
    let qtySum = 0
    let valueSum = 0
    for (const e of t.exits) {
      const q = contractQtyFromMargin(e.volume, e.price, lev)
      qtySum += q
      valueSum += q * e.price
    }
    avgExit = qtySum > 0 ? valueSum / qtySum : null
  }

  const fullPnl = calculateTradePnL(t)
  const realized = calculateRealizedPnL(t)

  let displayPnl: number | null
  if (t.status === TradeStatus.CLOSED) {
    displayPnl = fullPnl
  } else {
    displayPnl = exitVolume > 0 ? realized : null
  }

  const entryNotional = entryLegsNotionalUsdt(t.entries)
  let tradeRoiPct: number | null = null
  if (t.status === TradeStatus.CLOSED && entryNotional > 0) {
    tradeRoiPct = (fullPnl / entryNotional) * 100
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

export function attachJournalToTradesList(
  trades: TradeWithLegs[],
  riskById?: Map<string, TradeRiskDto>,
): TradeWithJournal[] {
  return trades.map((t) => {
    const journal = buildTradeJournalMetrics(t)
    const risk = riskById?.get(t.id) ?? defaultTradeRisk()
    const exits: ExitWithLegJournal[] = t.exits.map((ex) => ({
      ...ex,
      legJournal: buildExitLegJournal(t, ex),
    }))
    return { ...t, entries: t.entries, exits, journal, risk }
  })
}
