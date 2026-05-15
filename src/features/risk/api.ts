import type { RiskSettingsBalanceSyncDto, RiskSettingsDto } from "@/contracts/risk"
import { fetchEnvelope } from "@/lib/api-fetch"

export type RiskSettingsResponse = {
  settings: RiskSettingsDto
  portfolio: RiskSettingsBalanceSyncDto
}

export function getRiskSettings() {
  return fetchEnvelope<RiskSettingsResponse>("/api/settings/risk", { cache: "no-store" })
}

export function patchRiskSettings(body: Record<string, unknown>) {
  return fetchEnvelope<RiskSettingsDto>("/api/settings/risk", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function postRiskSyncBalance() {
  return fetchEnvelope<RiskSettingsDto & { syncedBalanceUsdt: number }>(
    "/api/settings/risk/sync-balance",
    { method: "POST" },
  )
}

export function postRiskEvaluate(body: {
  markPrices?: Record<string, number>
  markPricesByTradeId?: Record<string, number>
  accountId?: string
}) {
  return fetchEnvelope<import("@/contracts/risk").RiskEvaluateResponseDto>("/api/risk/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function patchTradeStopLoss(tradeId: string, stopLossPrice: number | null) {
  return fetchEnvelope<{ trade: import("@/contracts/trades").TradeListItemDto }>(
    `/api/trades/${encodeURIComponent(tradeId)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stopLossPrice }),
    },
  )
}
