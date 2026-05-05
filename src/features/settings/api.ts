import type {
  AccountsListDto,
  AccountDto,
  EmotionDto,
  StrategyDto,
} from "@/contracts/settings-catalog"
import { fetchEnvelope } from "@/lib/api-fetch"

export function getAccounts() {
  return fetchEnvelope<AccountsListDto>("/api/settings/accounts", { cache: "no-store" })
}

export function postAccount(body: { name: string; source?: "MANUAL" | "BINGX" }) {
  return fetchEnvelope<{ account: AccountDto }>("/api/settings/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function patchAccount(id: string, body: Record<string, unknown>) {
  return fetchEnvelope<{ account: AccountsListDto["accounts"][0] }>(
    `/api/settings/accounts/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )
}

export function deleteAccount(id: string) {
  return fetchEnvelope<{ deleted: boolean }>(
    `/api/settings/accounts/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  )
}

export function getStrategies() {
  return fetchEnvelope<{ strategies: StrategyDto[] }>("/api/settings/strategies", {
    cache: "no-store",
  })
}

export function postStrategy(body: {
  name: string
  timeframe?: string | null
  setup?: string | null
  riskNote?: string | null
}) {
  return fetchEnvelope<{ strategy: StrategyDto }>("/api/settings/strategies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function patchStrategy(id: string, body: Record<string, unknown>) {
  return fetchEnvelope<{ strategy: StrategyDto }>(
    `/api/settings/strategies/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )
}

export function deleteStrategy(id: string) {
  return fetchEnvelope<{ deleted: boolean }>(
    `/api/settings/strategies/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  )
}

export function getEmotions() {
  return fetchEnvelope<{ emotions: EmotionDto[] }>("/api/settings/emotions", { cache: "no-store" })
}

export function postEmotion(body: { name: string }) {
  return fetchEnvelope<{ emotion: EmotionDto }>("/api/settings/emotions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

export function patchEmotion(id: string, body: Record<string, unknown>) {
  return fetchEnvelope<{ emotion: EmotionDto }>(
    `/api/settings/emotions/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  )
}

export function deleteEmotion(id: string) {
  return fetchEnvelope<{ deleted: boolean }>(
    `/api/settings/emotions/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  )
}
