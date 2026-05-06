import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { dashboardService } from "@/server/services/dashboard-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  const sp = req.nextUrl.searchParams
  const dayStart = sp.get("dayStart") ?? ""
  const dayEndExclusive = sp.get("dayEndExclusive") ?? ""
  const accountIdRaw = sp.get("accountId")
  const accountId = accountIdRaw && accountIdRaw.trim() !== "" ? accountIdRaw.trim() : undefined

  if (!dayStart || !dayEndExclusive) {
    return jsonErr("Нужны query-параметры dayStart и dayEndExclusive (ISO 8601)", 400)
  }

  try {
    const result = await dashboardService.getDayStats(userId, dayStart, dayEndExclusive, accountId)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk(result.data)
  } catch (e) {
    console.error(e)
    return jsonErr("GET day-stats error", 500)
  }
}
