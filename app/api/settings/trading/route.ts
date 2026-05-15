import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { handleRouteError } from "@/server/http/handle-route-error"
import { tradingSettingsService } from "@/server/services/trading-settings-service"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  try {
    const data = await tradingSettingsService.getTradingDefaults(userId)
    return jsonOk(data)
  } catch (e) {
    return handleRouteError(e, "GET trading settings error")
  }
}

export async function PATCH(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const result = await tradingSettingsService.patchTradingDefaults(userId, body)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk(result.data)
  } catch (e) {
    return handleRouteError(e, "PATCH trading settings error")
  }
}
