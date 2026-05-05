import type { ApiResponse } from "@/contracts/api-response"

export type EnvelopeOk<T> = { ok: true; data: T }
export type EnvelopeFail = { ok: false; status: number; error: string }

/**
 * fetch JSON API с единым envelope `{ success, data?, error? }`.
 */
export async function fetchEnvelope<T>(
  input: string,
  init?: Parameters<typeof fetch>[1],
): Promise<EnvelopeOk<T> | EnvelopeFail> {
  const headers = new Headers(init?.headers)
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json")
  }
  const r = await fetch(input, {
    ...init,
    credentials: "include",
    headers,
  })

  const ct = r.headers.get("content-type") ?? ""
  if (!ct.includes("application/json")) {
    return {
      ok: false,
      status: r.status,
      error: `Сервер вернул не JSON (HTTP ${r.status})`,
    }
  }

  const payload = (await r.json().catch(() => null)) as ApiResponse<T> | null
  if (!payload || typeof payload !== "object" || !("success" in payload)) {
    return { ok: false, status: r.status, error: "Некорректное тело ответа" }
  }

  if (!payload.success) {
    return {
      ok: false,
      status: r.status,
      error: "error" in payload && payload.error ? String(payload.error) : "Ошибка",
    }
  }

  return { ok: true, data: payload.data as T }
}
