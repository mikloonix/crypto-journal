import { TradeStatus, type Trade, type Entry, type Exit } from "@prisma/client"
import {
  calculateTradePnL,
  calculateRealizedPnL,
  calculateVolumes,
} from "@/server/trading/trade-pnl"
import { pnlRoiForExitLeg } from "@/lib/exit-leg-pnl"
import {
  contractQtyFromMargin,
  contractQtyFromExitMargin,
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

export function buildTradeJournalMetrics(
  t: TradeWithLegs,
  depositUsdt?: number,
): TradeJournalMetricsDto {
  const { entryVolume, exitVolume, remainingVolume } = calculateVolumes(t)
  const maxLeverage = tradeLeverageFromEntries(t.entries)
  const avgEntry = entryVolume > 0 ? weightedAvgEntryPrice(t.entries) : null
  const lev = maxLeverage
  let avgExit: number | null = null
  if (exitVolume > 0) {
    let qtySum = 0
    let valueSum = 0
    const avgForExit = avgEntry ?? weightedAvgEntryPrice(t.entries)
    for (const e of t.exits) {
      const q = contractQtyFromExitMargin(e.volume, avgForExit, lev)
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

  let tradeRoiPct: number | null = null
  if (t.status === TradeStatus.CLOSED && entryVolume > 0) {
    tradeRoiPct = (fullPnl / entryVolume) * 100
  }

  let depositRoiPct: number | null = null
  if (depositUsdt != null && depositUsdt > 0 && displayPnl != null) {
    depositRoiPct = (displayPnl / depositUsdt) * 100
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
    depositRoiPct,
    durationMs,
  }
}

export function buildExitLegJournal(
  t: TradeWithLegs,
  exit: Exit,
  depositUsdt?: number,
): ExitLegJournalDto {
  const leg = pnlRoiForExitLeg(t.direction, t.entries, exit)
  const depositRoiPct =
    depositUsdt != null && depositUsdt > 0 ? (leg.pnl / depositUsdt) * 100 : 0
  return { ...leg, depositRoiPct }
}

export function attachJournalToTradesList(
  trades: TradeWithLegs[],
  riskById?: Map<string, TradeRiskDto>,
  depositUsdt?: number,
): TradeWithJournal[] {
  return trades.map((t) => {
    const journal = buildTradeJournalMetrics(t, depositUsdt)
    const risk = riskById?.get(t.id) ?? defaultTradeRisk()
    const exits: ExitWithLegJournal[] = t.exits.map((ex) => ({
      ...ex,
      legJournal: buildExitLegJournal(t, ex, depositUsdt),
    }))
    return { ...t, entries: t.entries, exits, journal, risk }
  })
}
