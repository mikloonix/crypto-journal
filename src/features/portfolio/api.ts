import type { CashflowDto, CashflowListResponseDto } from "@/contracts/cashflow"
import { fetchEnvelope } from "@/lib/api-fetch"

export function getCashflows(query?: { from?: string; to?: string }) {
  const qs = new URLSearchParams()
  if (query?.from) qs.set("from", query.from)
  if (query?.to) qs.set("to", query.to)
  const suffix = qs.toString() ? `?${qs}` : ""
  return fetchEnvelope<CashflowListResponseDto>(`/api/cashflows${suffix}`, { cache: "no-store" })
}

export function postCashflow(body: Record<string, unknown>) {
  return fetchEnvelope<{ cashflow: CashflowDto }>("/api/cashflows", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function patchCashflow(id: string, body: Record<string, unknown>) {
  return fetchEnvelope<{ cashflow: CashflowDto }>(
    `/api/cashflows/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )
}

export function deleteCashflow(id: string) {
  return fetchEnvelope<{ deleted: boolean }>(`/api/cashflows/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
}
