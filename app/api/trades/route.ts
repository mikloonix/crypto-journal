import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
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
    console.error(e)
    return jsonErr("GET error", 500)
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
    console.error(e)
    const msg = e instanceof Error ? e.message : "POST error"
    return jsonErr(msg, 500)
  }
}
