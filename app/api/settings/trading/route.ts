import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
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
    console.error(e)
    return jsonErr("GET error", 500)
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
    console.error(e)
    const msg = e instanceof Error ? e.message : String(e)
    if (/Unknown argument|display_time_zone|displayTimeZone|column.*does not exist/i.test(msg)) {
      return jsonErr(
        "Не удалось сохранить: схема БД без поля часового пояса. Выполните миграции Prisma (displayTimeZone).",
        500,
      )
    }
    return jsonErr(msg.length > 200 ? "PATCH error" : msg, 500)
  }
}
