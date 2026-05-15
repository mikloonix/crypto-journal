import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { handleRouteError } from "@/server/http/handle-route-error"
import { riskSettingsService } from "@/server/services/risk-settings-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  try {
    void req
    const result = await riskSettingsService.syncBalanceFromPortfolio(userId)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk(result.data)
  } catch (e) {
    return handleRouteError(e, "POST risk sync balance error")
  }
}
