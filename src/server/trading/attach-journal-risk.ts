import type { JournalRiskSummaryDto, TradeRiskDto } from "@/contracts/risk"
import type { JournalSummaryDto } from "@/contracts/trades"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"
import { tradesRepository } from "@/server/repositories/trades-repository"
import type { JournalEquityScope } from "@/server/trading/cashflow-usdt"
import { buildRiskSnapshot, zonedTodayBounds } from "@/server/trading/risk-evaluation"
import { createQuoteProvider } from "@/server/trading/quote-provider"
import type { TradeWithLegs } from "@/server/trading/journal-metrics"

const emptySummary: JournalRiskSummaryDto = {
  openRiskUsdt: 0,
  openRiskPctSum: 0,
  dailyRealizedLossUsdt: 0,
  dailyUnrealizedLossUsdt: null,
  dailyRiskUsedPct: 0,
  drawdownPct: null,
  peakEquityUsdt: null,
  warnings: [],
  hasMarkPrices: false,
}

export async function buildJournalRiskPack(
  userId: string,
  rows: TradeWithLegs[],
  equitySummary: JournalSummaryDto,
  scope: JournalEquityScope,
  opts?: {
    markPrices?: Record<string, number>
    markPricesByTradeId?: Record<string, number>
  },
): Promise<{ perTrade: Map<string, TradeRiskDto>; summary: JournalRiskSummaryDto }> {
  const rs = await riskSettingsRepository.upsertDefaults(userId)
  const tz = (rs.displayTimeZone && String(rs.displayTimeZone).trim()) || "UTC"
  const { dayStart, dayEndExclusive } = zonedTodayBounds(tz)

  const accountId = scope.journalAllAccounts ? undefined : scope.journalAccountId
  const exitsRaw = await tradesRepository.findExitsInTimestampHalfOpenRange(
    userId,
    dayStart,
    dayEndExclusive,
    accountId,
  )

  const exitsToday = exitsRaw.map((ex) => ({
    trade: {
      ...ex.trade,
      exits: ex.trade.exits.filter((e) => e.deletedAt == null),
    } as TradeWithLegs,
    exit: ex,
  }))

  return buildRiskSnapshot({
    settings: rs,
    trades: rows,
    equitySummary,
    timeZone: tz,
    quotes: createQuoteProvider(opts?.markPrices ?? {}),
    exitsToday,
    markPricesByTradeId: opts?.markPricesByTradeId,
  })
}

export function defaultTradeRisk(): TradeRiskDto {
  return { status: "NA", riskUsdt: null, riskPct: null, reasons: [] }
}

export { emptySummary as emptyJournalRiskSummary }
