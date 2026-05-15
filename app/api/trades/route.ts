import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { handleRouteError } from "@/server/http/handle-route-error"
import { tradesService } from "@/server/services/trades-service"
import { parseJournalListQuery } from "@/server/trades/journal-list-query"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  try {
    const parsed = parseJournalListQuery(req.nextUrl.searchParams)
    if (parsed.kind === "error") {
      return jsonErr(parsed.message, 400)
    }
    const data = await tradesService.listJournal(userId, parsed)
    return jsonOk(data)
  } catch (e) {
    return handleRouteError(e, "GET trades error")
  }
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const result = await tradesService.openTrade(userId, body)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk({ trade: result.trade })
  } catch (e) {
    return handleRouteError(e, "POST trades error")
  }
}
