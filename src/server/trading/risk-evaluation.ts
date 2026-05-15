import { MarketType, TradeStatus, type RiskSettings } from "@prisma/client"
import { pnlRoiForExitLeg } from "@/lib/exit-leg-pnl"
import type { JournalRiskSummaryDto, TradeRiskDto, TradeRiskStatusDto } from "@/contracts/risk"
import type { JournalSummaryDto } from "@/contracts/trades"
import { zonedDayBoundsIsoForPreset } from "@/lib/zoned-date-range"
import {
  contractQtyFromMargin,
  tradeLeverageFromEntries,
  weightedAvgEntryPrice,
} from "@/server/trading/position-margin"
import type { QuoteProvider } from "@/server/trading/quote-provider"
import type { TradeWithLegs } from "@/server/trading/journal-metrics"
export type RiskSettingsSlice = Pick<
  RiskSettings,
  "accountBalance" | "riskPerTrade" | "riskPerDay" | "maxDrawdown" | "maxOpenRisk"
>

function balanceDenom(settings: RiskSettingsSlice): number {
  return settings.accountBalance > 0 ? settings.accountBalance : 1
}

function openContractQty(trade: TradeWithLegs): number {
  const lev = tradeLeverageFromEntries(trade.entries)
  let entryQty = 0
  for (const e of trade.entries) {
    entryQty += contractQtyFromMargin(e.volume, e.price, e.leverage)
  }
  let exitQty = 0
  for (const x of trade.exits) {
    exitQty += contractQtyFromMargin(x.volume, x.price, lev)
  }
  return Math.max(0, entryQty - exitQty)
}

export function evaluateOpenTradeRisk(
  trade: TradeWithLegs,
  settings: RiskSettingsSlice,
): TradeRiskDto {
  if (trade.marketType === MarketType.SPOT) {
    return { status: "NA", riskUsdt: null, riskPct: null, reasons: [] }
  }
  if (trade.status !== TradeStatus.OPEN) {
    return { status: "NA", riskUsdt: null, riskPct: null, reasons: [] }
  }

  const reasons: string[] = []
  const stop = trade.stopLossPrice
  if (stop == null || !(stop > 0)) {
    return {
      status: "HIGH",
      riskUsdt: null,
      riskPct: null,
      reasons: ["Нет стоп-лосса"],
    }
  }

  const avgEntry = weightedAvgEntryPrice(trade.entries)
  if (!(avgEntry > 0)) {
    return {
      status: "HIGH",
      riskUsdt: null,
      riskPct: null,
      reasons: ["Нет данных по входу"],
    }
  }

  const qty = openContractQty(trade)
  if (!(qty > 0)) {
    return {
      status: "HIGH",
      riskUsdt: null,
      riskPct: null,
      reasons: ["Позиция закрыта"],
    }
  }

  const riskUsdt = Math.abs(avgEntry - stop) * qty
  const riskPct = (riskUsdt / balanceDenom(settings)) * 100

  if (riskPct > settings.riskPerTrade + 1e-9) {
    reasons.push(
      `Риск ${riskPct.toFixed(2)}% превышает лимит на сделку ${settings.riskPerTrade}%`,
    )
  }

  const status: TradeRiskStatusDto = reasons.length > 0 ? "HIGH" : "OK"
  return { status, riskUsdt, riskPct, reasons }
}

export function unrealizedLossUsdt(
  trade: TradeWithLegs,
  markPrice: number | null,
): number {
  if (trade.status !== TradeStatus.OPEN || !(markPrice != null && markPrice > 0)) {
    return 0
  }
  const avgEntry = weightedAvgEntryPrice(trade.entries)
  const qty = openContractQty(trade)
  if (!(avgEntry > 0) || !(qty > 0)) return 0

  let gross = (markPrice - avgEntry) * qty
  if (trade.direction === "SHORT") gross = -gross
  return gross < 0 ? -gross : 0
}

export type BuildRiskSnapshotInput = {
  settings: RiskSettingsSlice
  trades: TradeWithLegs[]
  equitySummary: JournalSummaryDto
  timeZone: string
  quotes: QuoteProvider
  /** Выходы за «сегодня» в TZ (уже отфильтрованы по скоупу). */
  exitsToday: Array<{
    trade: TradeWithLegs
    exit: TradeWithLegs["exits"][number]
  }>
  markPricesByTradeId?: Record<string, number>
}

export function buildRiskSnapshot(input: BuildRiskSnapshotInput): {
  perTrade: Map<string, TradeRiskDto>
  summary: JournalRiskSummaryDto
} {
  const { settings, trades, equitySummary, quotes, exitsToday, markPricesByTradeId = {} } =
    input

  const perTrade = new Map<string, TradeRiskDto>()
  let openRiskUsdt = 0
  let openRiskPctSum = 0

  const openTrades = trades.filter((t) => t.status === TradeStatus.OPEN)

  for (const t of trades) {
    const risk = evaluateOpenTradeRisk(t, settings)
    perTrade.set(t.id, risk)
    if (t.status === TradeStatus.OPEN && t.marketType === MarketType.FUTURE) {
      if (risk.riskUsdt != null) openRiskUsdt += risk.riskUsdt
      if (risk.riskPct != null) openRiskPctSum += risk.riskPct
    }
  }

  let dailyRealizedLossUsdt = 0
  for (const { trade, exit } of exitsToday) {
    const leg = pnlRoiForExitLeg(trade.direction, trade.entries, exit)
    if (leg.pnl < 0) dailyRealizedLossUsdt += -leg.pnl
  }

  let hasMarkPrices = false
  let dailyUnrealizedLossUsdt = 0
  for (const t of openTrades) {
    const byId = markPricesByTradeId[t.id]
    const mark =
      byId != null && Number.isFinite(byId) && byId > 0
        ? byId
        : quotes.getMarkPrice(t.symbol)
    if (mark != null && mark > 0) {
      hasMarkPrices = true
      dailyUnrealizedLossUsdt += unrealizedLossUsdt(t, mark)
    }
  }

  const dailyLossUsdt = dailyRealizedLossUsdt + dailyUnrealizedLossUsdt
  const dailyRiskUsedPct = (dailyLossUsdt / balanceDenom(settings)) * 100

  const warnings: string[] = []

  if (openRiskPctSum > settings.maxOpenRisk + 1e-9) {
    warnings.push(
      `Суммарный риск открытых ${openRiskPctSum.toFixed(2)}% > лимита ${settings.maxOpenRisk}%`,
    )
  }
  if (dailyRiskUsedPct > settings.riskPerDay + 1e-9) {
    warnings.push(
      `Дневной убыток ${dailyRiskUsedPct.toFixed(2)}% > лимита ${settings.riskPerDay}%`,
    )
  }

  let peakEquityUsdt: number | null = null
  let drawdownPct: number | null = null
  const curve = equitySummary.equityCurve
  if (curve.length > 0) {
    peakEquityUsdt = Math.max(...curve.map((p) => p.balance))
    const current = equitySummary.balanceEstimateUsdt
    if (peakEquityUsdt > 1e-9 && current < peakEquityUsdt) {
      drawdownPct = ((peakEquityUsdt - current) / peakEquityUsdt) * 100
      if (drawdownPct > settings.maxDrawdown + 1e-9) {
        warnings.push(
          `Просадка ${drawdownPct.toFixed(2)}% > лимита ${settings.maxDrawdown}%`,
        )
      }
    }
  }

  if (!hasMarkPrices && openTrades.some((t) => t.marketType === MarketType.FUTURE)) {
    warnings.push(
      "Нереализованный дневной риск не учтён: укажите текущие цены (усреднение / BingX позже)",
    )
  }

  return {
    perTrade,
    summary: {
      openRiskUsdt,
      openRiskPctSum,
      dailyRealizedLossUsdt,
      dailyUnrealizedLossUsdt: hasMarkPrices ? dailyUnrealizedLossUsdt : null,
      dailyRiskUsedPct,
      drawdownPct,
      peakEquityUsdt,
      warnings,
      hasMarkPrices,
    },
  }
}

export { suggestMarginFromRisk } from "@/lib/risk-position-calc"

export function zonedTodayBounds(timeZone: string): { dayStart: Date; dayEndExclusive: Date } {
  const { dayStart, dayEndExclusive } = zonedDayBoundsIsoForPreset(timeZone, "today")
  return { dayStart: new Date(dayStart), dayEndExclusive: new Date(dayEndExclusive) }
}
