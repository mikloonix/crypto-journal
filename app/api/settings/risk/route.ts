import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { handleRouteError } from "@/server/http/handle-route-error"
import { riskSettingsService } from "@/server/services/risk-settings-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  try {
    const data = await riskSettingsService.get(userId)
    const portfolio = await riskSettingsService.balanceFromPortfolio(userId)
    return jsonOk({ settings: data, portfolio })
  } catch (e) {
    return handleRouteError(e, "GET risk settings error")
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  try {
    const body = (await req.json()) as unknown
    const result = await riskSettingsService.patch(userId, body)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk(result.data)
  } catch (e) {
    return handleRouteError(e, "PATCH risk settings error")
  }
}
