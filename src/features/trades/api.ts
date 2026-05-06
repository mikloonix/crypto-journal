import type {
  AveragingComputeResultDto,
  AveragingContextDto,
  DashboardDayStatsDto,
} from "@/contracts/dashboard"
import type { AnalyticsSnapshotDto } from "@/contracts/analytics"
import type {
  TradesJournalListDto,
  TradeListItemDto,
  TradingDefaultsDto,
  TrashItemDto,
  DeleteTradeResultDto,
  RestoreTradeResultDto,
} from "@/contracts/trades"
import { fetchEnvelope } from "@/lib/api-fetch"

export function getJournalSymbols(query?: { status?: "OPEN" | "CLOSED" }) {
  const qs = new URLSearchParams()
  if (query?.status) qs.set("status", query.status)
  const suffix = qs.toString() ? `?${qs}` : ""
  return fetchEnvelope<{ symbols: string[] }>(`/api/trades/symbols${suffix}`, {
    cache: "no-store",
  })
}

export function getJournalStrategyValues(query?: { status?: "OPEN" | "CLOSED" }) {
  const qs = new URLSearchParams()
  if (query?.status) qs.set("status", query.status)
  const suffix = qs.toString() ? `?${qs}` : ""
  return fetchEnvelope<{ strategies: string[] }>(`/api/trades/strategy-values${suffix}`, {
    cache: "no-store",
  })
}

export function getTradesJournal(query?: Record<string, string | undefined | null>) {
  const qs = new URLSearchParams()
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") qs.set(k, v)
    }
  }
  const suffix = qs.toString() ? `?${qs}` : ""
  return fetchEnvelope<TradesJournalListDto>(`/api/trades${suffix}`, { cache: "no-store" })
}

export function postOpenTrade(body: Record<string, unknown>) {
  return fetchEnvelope<{ trade: TradeListItemDto }>("/api/trades", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function postCloseTrade(body: Record<string, unknown>) {
  return fetchEnvelope<{ trade: TradeListItemDto }>("/api/trades/close", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function postDeleteTrade(body: Record<string, unknown>) {
  return fetchEnvelope<DeleteTradeResultDto>("/api/trades/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function getTradingDefaults() {
  return fetchEnvelope<TradingDefaultsDto>("/api/settings/trading")
}

export function patchTradingDefaults(body: Record<string, unknown>) {
  return fetchEnvelope<TradingDefaultsDto>("/api/settings/trading", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function getAnalytics(query?: Record<string, string | undefined | null>) {
  const qs = new URLSearchParams()
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v != null && v !== "") qs.set(k, v)
    }
  }
  const suffix = qs.toString() ? `?${qs}` : ""
  return fetchEnvelope<AnalyticsSnapshotDto>(`/api/analytics${suffix}`, { cache: "no-store" })
}

export function getTrash() {
  return fetchEnvelope<TrashItemDto>("/api/trades/trash", { cache: "no-store" })
}

export function postRestore(body: Record<string, unknown>) {
  return fetchEnvelope<RestoreTradeResultDto>("/api/trades/restore", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function getDashboardDayStats(query: {
  dayStart: string
  dayEndExclusive: string
  accountId?: string
}) {
  const qs = new URLSearchParams()
  qs.set("dayStart", query.dayStart)
  qs.set("dayEndExclusive", query.dayEndExclusive)
  if (query.accountId) qs.set("accountId", query.accountId)
  return fetchEnvelope<DashboardDayStatsDto>(`/api/dashboard/day-stats?${qs}`, {
    cache: "no-store",
  })
}

export function getAveragingContext(query?: { accountId?: string }) {
  const qs = new URLSearchParams()
  if (query?.accountId) qs.set("accountId", query.accountId)
  const suffix = qs.toString() ? `?${qs}` : ""
  return fetchEnvelope<AveragingContextDto>(`/api/dashboard/averaging${suffix}`, {
    cache: "no-store",
  })
}

export function postAveragingCompute(body: {
  accountId?: string
  inputs: Record<string, Record<string, unknown>>
}) {
  return fetchEnvelope<AveragingComputeResultDto>("/api/dashboard/averaging", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}
