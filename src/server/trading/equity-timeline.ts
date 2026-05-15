import { TradeStatus, type Cashflow, type Entry, type Exit, type Trade } from "@prisma/client"
import { calculateTradePnL } from "@/server/trading/trade-pnl"
import type { AnalyticsEquityPointDto } from "@/contracts/analytics"
import type { EquityCurvePointDto, JournalSummaryDto } from "@/contracts/trades"
import {
  cashflowPortfolioDeltaUsdt,
  netCashflowPortfolioUsdt,
  type JournalEquityScope,
} from "@/server/trading/cashflow-usdt"
import { JOURNAL_INITIAL_DEPOSIT_USDT } from "@/server/trading/equity-constants"

export type TradeWithLegsForEquity = Trade & { entries: Entry[]; exits: Exit[] }

type TradeClosed = TradeWithLegsForEquity & { status: typeof TradeStatus.CLOSED; closedAt: Date }

function isClosed(t: TradeWithLegsForEquity): t is TradeClosed {
  return t.status === TradeStatus.CLOSED && t.closedAt != null
}

function tradeInScope(t: TradeWithLegsForEquity, scope: JournalEquityScope): boolean {
  if (scope.journalAllAccounts) return true
  if (!scope.journalAccountId) return true
  return t.accountId === scope.journalAccountId
}

type TimelineRow =
  | { kind: "trade"; at: number; pnl: number; trade: TradeClosed }
  | { kind: "cashflow"; at: number; delta: number; id: string }

function buildTimelineRows(
  closedTrades: TradeWithLegsForEquity[],
  cashflows: Cashflow[],
  scope: JournalEquityScope,
): TimelineRow[] {
  const rows: TimelineRow[] = []
  for (const t of closedTrades) {
    if (!isClosed(t)) continue
    if (!tradeInScope(t, scope)) continue
    const pnl = calculateTradePnL(t)
    rows.push({
      kind: "trade",
      at: t.closedAt.getTime(),
      pnl,
      trade: t,
    })
  }
  for (const cf of cashflows) {
    const delta = cashflowPortfolioDeltaUsdt(cf, scope)
    if (!Number.isFinite(delta) || delta === 0) continue
    rows.push({ kind: "cashflow", at: cf.timestamp.getTime(), delta, id: cf.id })
  }
  rows.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at
    if (a.kind !== b.kind) return a.kind === "cashflow" ? -1 : 1
    return 0
  })
  return rows
}

export type BuildJournalEquitySummaryOpts = {
  openCount: number
}

export function buildJournalEquitySummary(
  closedTradesForEquity: TradeWithLegsForEquity[],
  cashflows: Cashflow[],
  scope: JournalEquityScope,
  opts: BuildJournalEquitySummaryOpts,
): JournalSummaryDto {
  const scopedClosed = closedTradesForEquity.filter((t) => isClosed(t) && tradeInScope(t, scope))
  const totalPnlClosedUsdt = scopedClosed.reduce((s, t) => s + calculateTradePnL(t), 0)
  const hasCashflow = cashflows.length > 0
  const netCf = netCashflowPortfolioUsdt(cashflows, scope)

  const initialDepositUsdt = hasCashflow ? Math.max(netCf, 0) : JOURNAL_INITIAL_DEPOSIT_USDT
  const balanceEstimateUsdt = hasCashflow
    ? (Number.isFinite(netCf) ? netCf : 0) + totalPnlClosedUsdt
    : JOURNAL_INITIAL_DEPOSIT_USDT + totalPnlClosedUsdt

  const roiDenom =
    hasCashflow && netCf > 1e-9
      ? netCf
      : !hasCashflow
        ? JOURNAL_INITIAL_DEPOSIT_USDT
        : 0
  const roiPercent =
    roiDenom > 1e-9 ? (totalPnlClosedUsdt / roiDenom) * 100 : 0

  const denomRoiCurve =
    initialDepositUsdt > 1e-9 ? initialDepositUsdt : JOURNAL_INITIAL_DEPOSIT_USDT
  let running = hasCashflow ? 0 : JOURNAL_INITIAL_DEPOSIT_USDT
  const timeline = buildTimelineRows(closedTradesForEquity, cashflows, scope)
  const equityCurve: EquityCurvePointDto[] = []
  let step = 0
  for (const row of timeline) {
    if (row.kind === "trade") {
      const pnl = row.pnl
      running += pnl
      step += 1
      const roi = denomRoiCurve > 1e-9 ? (running / denomRoiCurve - 1) * 100 : 0
      equityCurve.push({
        tradeIndex: step,
        balance: running,
        pnl,
        roi,
        event: "trade",
      })
    } else {
      running += row.delta
      step += 1
      const roi = denomRoiCurve > 1e-9 ? (running / denomRoiCurve - 1) * 100 : 0
      equityCurve.push({
        tradeIndex: step,
        balance: running,
        pnl: row.delta,
        roi,
        event: "cashflow",
      })
    }
  }

  return {
    initialDepositUsdt,
    balanceEstimateUsdt,
    totalPnlClosedUsdt,
    roiPercent,
    openCount: opts.openCount,
    equityCurve,
  }
}

export function capitalUsdtBeforeExclusive(
  atExclusive: Date,
  closedTradesAll: TradeWithLegsForEquity[],
  cashflowsBeforeExclusive: Cashflow[],
  scope: JournalEquityScope,
  journalHasAnyCashflow: boolean,
): number {
  const tCut = atExclusive.getTime()
  const tradesBefore = closedTradesAll.filter(
    (t) =>
      isClosed(t) &&
      tradeInScope(t, scope) &&
      t.closedAt.getTime() < tCut,
  )
  const cfBefore = cashflowsBeforeExclusive.filter((c) => c.timestamp.getTime() < tCut)

  const pnl = tradesBefore.reduce((s, t) => s + calculateTradePnL(t), 0)
  const netCf = netCashflowPortfolioUsdt(cfBefore, scope)
  if (!Number.isFinite(netCf)) return NaN
  if (!journalHasAnyCashflow) return JOURNAL_INITIAL_DEPOSIT_USDT + pnl
  return netCf + pnl
}

export function buildAnalyticsEquityCurve(
  capital0: number,
  tradesInPeriod: TradeWithLegsForEquity[],
  cashflowsInPeriod: Cashflow[],
  scope: JournalEquityScope,
): AnalyticsEquityPointDto[] {
  const closed = tradesInPeriod
    .filter((t) => isClosed(t) && tradeInScope(t, scope))
    .slice()
    .sort((a, b) => (a.closedAt!.getTime() - b.closedAt!.getTime()))

  const rows: TimelineRow[] = []
  for (const t of closed) {
    rows.push({
      kind: "trade",
      at: t.closedAt!.getTime(),
      pnl: calculateTradePnL(t),
      trade: t as TradeClosed,
    })
  }
  for (const cf of cashflowsInPeriod) {
    const delta = cashflowPortfolioDeltaUsdt(cf, scope)
    if (!Number.isFinite(delta) || delta === 0) continue
    rows.push({ kind: "cashflow", at: cf.timestamp.getTime(), delta, id: cf.id })
  }
  rows.sort((a, b) => {
    if (a.at !== b.at) return a.at - b.at
    if (a.kind !== b.kind) return a.kind === "cashflow" ? -1 : 1
    return 0
  })

  const curve: AnalyticsEquityPointDto[] = []
  let cumTradePnl = 0
  let balance = capital0
  let idx = 0

  for (const row of rows) {
    idx += 1
    if (row.kind === "trade") {
      const p = row.pnl
      cumTradePnl += p
      balance += p
    } else {
      balance += row.delta
    }

    const atIso =
      row.kind === "trade"
        ? new Date(row.trade.closedAt!).toISOString()
        : new Date(row.at).toISOString()
    const stepPnl = row.kind === "trade" ? row.pnl : row.delta

    curve.push({
      index: idx,
      closedAt: atIso,
      pnlUsdt: stepPnl,
      cumulativePnlUsdt: cumTradePnl,
      balanceUsdt: balance,
    })
  }

  return curve
}

export function maxDrawdownFromBalances(
  capital0: number,
  balances: number[],
): { maxDdUsd: number; peak: number } {
  let peak = capital0
  let maxDd = 0
  for (const b of balances) {
    if (b > peak) peak = b
    const dd = peak - b
    if (dd > maxDd) maxDd = dd
  }
  return { maxDdUsd: maxDd, peak }
}
