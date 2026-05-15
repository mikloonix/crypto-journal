import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { handleRouteError } from "@/server/http/handle-route-error"
import { tradesService } from "@/server/services/trades-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type RouteCtx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  const { id } = await ctx.params
  if (!id) {
    return jsonErr("Invalid id", 400)
  }
  try {
    const body = (await req.json()) as unknown
    const result = await tradesService.patchTrade(userId, id, body)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk({ trade: result.trade })
  } catch (e) {
    return handleRouteError(e, "PATCH trade error")
  }
}
