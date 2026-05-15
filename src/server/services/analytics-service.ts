import { differenceInCalendarDays } from "date-fns"
import { MarketType } from "@prisma/client"
import { isValidIanaTimeZone } from "@/lib/iana-time-zone"
import { buildAnalyticsSnapshot } from "@/lib/analytics-metrics"
import { zonedPeriodHalfOpenUtc, zonedRollingPeriodInclusiveYmd } from "@/lib/zoned-date-range"
import type { AnalyticsSnapshotDto } from "@/contracts/analytics"
import { cashflowRepository } from "@/server/repositories/cashflow-repository"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"
import { tradesRepository } from "@/server/repositories/trades-repository"
import type { TradeWithLegs } from "@/server/trading/journal-metrics"
import { formatAnalyticsSnapshotCsv } from "@/server/analytics-csv"

export type AnalyticsQueryInput = {
  fromYmd: string | null
  toYmd: string | null
  symbol: string | null
  strategy: string | null
  marketType: string | null
}

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/
/** Лимит диапазона (календарных дней), анти-абьюз. */
export const ANALYTICS_MAX_RANGE_DAYS = 800

function parseMarketType(raw: string | null): MarketType | undefined {
  if (!raw || raw.trim() === "") return undefined
  const u = raw.trim().toUpperCase()
  if (u === "SPOT") return MarketType.SPOT
  if (u === "FUTURE") return MarketType.FUTURE
  return undefined
}

function defaultPeriodYmd(timeZone: string): { fromYmd: string; toYmd: string } {
  return zonedRollingPeriodInclusiveYmd(timeZone, 30)
}

export const analyticsService = {
  async getSnapshot(
    userId: string,
    query: AnalyticsQueryInput,
  ): Promise<
    | { ok: true; data: AnalyticsSnapshotDto }
    | { ok: false; error: string; status: number }
  > {
    const rs = await riskSettingsRepository.upsertDefaults(userId)
    const timeZoneRaw = (rs.displayTimeZone && String(rs.displayTimeZone).trim()) || "UTC"
    const timeZone = isValidIanaTimeZone(timeZoneRaw) ? timeZoneRaw : "UTC"

    let fromYmd = query.fromYmd?.trim() || ""
    let toYmd = query.toYmd?.trim() || ""
    if (!fromYmd || !toYmd) {
      const d = defaultPeriodYmd(timeZone)
      if (!fromYmd) fromYmd = d.fromYmd
      if (!toYmd) toYmd = d.toYmd
    }

    if (!YMD_RE.test(fromYmd) || !YMD_RE.test(toYmd)) {
      return { ok: false, error: "from и to — даты YYYY-MM-DD", status: 400 }
    }

    if (fromYmd > toYmd) {
      return { ok: false, error: "from не может быть позже to", status: 400 }
    }

    const daysSpan = differenceInCalendarDays(
      new Date(`${toYmd}T00:00:00Z`),
      new Date(`${fromYmd}T00:00:00Z`),
    )
    if (daysSpan > ANALYTICS_MAX_RANGE_DAYS) {
      return {
        ok: false,
        error: `Интервал не более ${ANALYTICS_MAX_RANGE_DAYS} дней`,
        status: 400,
      }
    }

    const { start, endExclusive } = zonedPeriodHalfOpenUtc(timeZone, fromYmd, toYmd)

    const journalAllAccounts = rs.journalAllAccounts ?? false
    const journalAccountId = rs.activeAccountId ?? undefined

    const marketTypeFilter = parseMarketType(query.marketType)
    if (query.marketType && query.marketType.trim() !== "" && marketTypeFilter === undefined) {
      return { ok: false, error: "marketType: SPOT или FUTURE", status: 400 }
    }

    const symbolFilter = query.symbol?.trim() || null
    const strategyFilter = query.strategy?.trim() || null

    const [before, period] = await Promise.all([
      tradesRepository.findClosedTradesClosedBefore(
        userId,
        start,
        journalAllAccounts,
        journalAccountId,
      ),
      tradesRepository.findClosedTradesAnalyticsPeriod(
        userId,
        start,
        endExclusive,
        journalAllAccounts,
        journalAccountId,
        {
          symbol: symbolFilter ?? undefined,
          strategy: strategyFilter ?? undefined,
          marketType: marketTypeFilter,
        },
      ),
    ])

    let cfAll: Awaited<ReturnType<typeof cashflowRepository.listForJournalScope>> = []
    try {
      cfAll = await cashflowRepository.listForJournalScope(
        userId,
        journalAllAccounts,
        journalAccountId,
      )
    } catch (err) {
      console.error("cashflow list skipped (analytics without portfolio):", err)
    }

    const tStart = start.getTime()
    const tEnd = endExclusive.getTime()
    const journalHasCashflow = cfAll.length > 0
    const cashflowsStrictlyBeforeStart = cfAll.filter((c) => c.timestamp.getTime() < tStart)
    const cashflowsInPeriod = cfAll.filter(
      (c) => c.timestamp.getTime() >= tStart && c.timestamp.getTime() < tEnd,
    )

    const data = buildAnalyticsSnapshot({
      timeZone,
      fromYmd,
      toYmd,
      journalAllAccounts,
      accountId: rs.activeAccountId ?? null,
      symbolFilter,
      strategyFilter,
      marketTypeFilter: marketTypeFilter ?? null,
      tradesClosedStrictlyBeforeStart: before as TradeWithLegs[],
      tradesClosedInPeriod: period as TradeWithLegs[],
      cashflowsStrictlyBeforeStart,
      cashflowsInPeriod,
      journalHasCashflow,
      periodStartUtc: start,
    })

    return { ok: true, data }
  },

  async getCsv(
    userId: string,
    query: AnalyticsQueryInput,
  ): Promise<{ ok: true; body: string } | { ok: false; error: string; status: number }> {
    const snap = await this.getSnapshot(userId, query)
    if (!snap.ok) return snap
    return { ok: true, body: formatAnalyticsSnapshotCsv(snap.data) }
  },
}
