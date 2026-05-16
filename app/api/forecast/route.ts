import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { forecastService } from "@/server/services/forecast-service"
import { handleRouteError } from "@/server/http/handle-route-error"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  const modeRaw = req.nextUrl.searchParams.get("mode") ?? "online"
  const mode = modeRaw === "plan" ? ("plan" as const) : ("online" as const)
  const planDepositRaw = req.nextUrl.searchParams.get("planDeposit")
  let planDeposit: number | null | undefined
  if (planDepositRaw != null && planDepositRaw.trim() !== "") {
    const n = Number(planDepositRaw)
    planDeposit = Number.isFinite(n) && n > 0 ? n : null
  }

  try {
    const result = await forecastService.getSnapshot(userId, mode, planDeposit)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk(result.data)
  } catch (e) {
    return handleRouteError(e, "GET forecast error")
  }
}
