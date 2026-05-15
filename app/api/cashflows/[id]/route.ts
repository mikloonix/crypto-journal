import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { handleRouteError } from "@/server/http/handle-route-error"
import { cashflowService } from "@/server/services/cashflow-service"

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
    const body = (await req.json()) as Record<string, unknown>
    const result = await cashflowService.update(userId, id, body)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk({ cashflow: result.cashflow })
  } catch (e) {
    return handleRouteError(e, "PATCH cashflow error")
  }
}

export async function DELETE(req: NextRequest, ctx: RouteCtx) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  const { id } = await ctx.params
  if (!id) {
    return jsonErr("Invalid id", 400)
  }
  try {
    const result = await cashflowService.remove(userId, id)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk({ deleted: true })
  } catch (e) {
    return handleRouteError(e, "DELETE cashflow error")
  }
}
