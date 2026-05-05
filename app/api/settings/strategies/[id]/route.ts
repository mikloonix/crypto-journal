import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { catalogSettingsService } from "@/server/services/catalog-settings-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
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
    const result = await catalogSettingsService.patchStrategy(userId, id, body)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk({ strategy: result.strategy })
  } catch (e) {
    console.error(e)
    return jsonErr("PATCH strategy error", 500)
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  const { id } = await ctx.params
  if (!id) {
    return jsonErr("Invalid id", 400)
  }
  try {
    const result = await catalogSettingsService.deleteStrategy(userId, id)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk({ deleted: true })
  } catch (e) {
    console.error(e)
    return jsonErr("DELETE strategy error", 500)
  }
}
