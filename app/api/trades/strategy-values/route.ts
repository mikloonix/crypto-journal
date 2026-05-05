import type { NextRequest } from "next/server"
import { TradeStatus } from "@prisma/client"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { tradesService } from "@/server/services/trades-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/** Уникальные строки strategy из журнала (для подсказок фильтра). */
export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  try {
    const raw = req.nextUrl.searchParams.get("status")
    let status: TradeStatus | undefined
    if (raw === "CLOSED") status = TradeStatus.CLOSED
    else if (raw === "OPEN") status = TradeStatus.OPEN
    else if (raw != null && raw !== "") {
      return jsonErr("status: OPEN или CLOSED", 400)
    }
    const strategies = await tradesService.listDistinctStrategies(userId, status)
    return jsonOk({ strategies })
  } catch (e) {
    console.error(e)
    return jsonErr("GET strategy-values error", 500)
  }
}
