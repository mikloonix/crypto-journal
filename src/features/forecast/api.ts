import type { ForecastSnapshotDto } from "@/contracts/forecast"
import { fetchEnvelope } from "@/lib/api-fetch"

export function getForecast(query: {
  mode: "plan" | "online"
  planDeposit?: number | null
}) {
  const qs = new URLSearchParams()
  qs.set("mode", query.mode)
  if (query.planDeposit != null && query.planDeposit > 0) {
    qs.set("planDeposit", String(query.planDeposit))
  }
  return fetchEnvelope<ForecastSnapshotDto>(`/api/forecast?${qs}`, { cache: "no-store" })
}
