import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { handleRouteError } from "@/server/http/handle-route-error"
import { cashflowService } from "@/server/services/cashflow-service"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  try {
    const rs = await riskSettingsRepository.upsertDefaults(userId)
    const from = req.nextUrl.searchParams.get("from")
    const to = req.nextUrl.searchParams.get("to")
    const data = await cashflowService.list(userId, {
      journalAllAccounts: rs.journalAllAccounts ?? false,
      journalAccountId: rs.activeAccountId ?? undefined,
      fromIso: from,
      toIso: to,
    })
    return jsonOk(data)
  } catch (e) {
    return handleRouteError(e, "GET cashflows error")
  }
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  try {
    const body = (await req.json()) as Record<string, unknown>
    const result = await cashflowService.create(userId, body)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk({ cashflow: result.cashflow })
  } catch (e) {
    return handleRouteError(e, "POST cashflows error")
  }
}
