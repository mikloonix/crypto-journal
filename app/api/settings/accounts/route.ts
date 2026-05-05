import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { accountsSettingsService } from "@/server/services/accounts-settings-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  try {
    const data = await accountsSettingsService.listAccounts(userId)
    return jsonOk(data)
  } catch (e) {
    console.error(e)
    return jsonErr("GET accounts error", 500)
  }
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  try {
    const body = (await req.json()) as Record<string, unknown>
    const result = await accountsSettingsService.createAccount(userId, body)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk({ account: result.account })
  } catch (e) {
    console.error(e)
    return jsonErr("POST accounts error", 500)
  }
}
