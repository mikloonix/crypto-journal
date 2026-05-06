import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { analyticsService } from "@/server/services/analytics-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

function analyticsRouteErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e)
  if (/Can't reach database server|P1001|ECONNREFUSED|ETIMEDOUT|getaddrinfo/i.test(msg)) {
    return "База данных недоступна. Проверьте DATABASE_URL, сеть и что Postgres (Supabase) запущен."
  }
  if (/Unknown argument [`']displayTimeZone[`']/i.test(msg)) {
    return "Устарел Prisma Client: остановите dev-сервер, выполните npx prisma generate и запустите снова."
  }
  return `Ошибка аналитики: ${msg}`
}

function parseQuery(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  return {
    fromYmd: sp.get("fromYmd") ?? sp.get("from") ?? null,
    toYmd: sp.get("toYmd") ?? sp.get("to") ?? null,
    symbol: sp.get("symbol"),
    strategy: sp.get("strategy"),
    marketType: sp.get("marketType"),
  }
}

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  const format = (req.nextUrl.searchParams.get("format") ?? "").toLowerCase()
  const query = parseQuery(req)

  try {
    if (format === "csv") {
      const csvRes = await analyticsService.getCsv(userId, query)
      if (!csvRes.ok) {
        return jsonErr(csvRes.error, csvRes.status)
      }
      const filename = `analytics-${query.fromYmd ?? "export"}-${query.toYmd ?? "export"}.csv`
      return new Response(csvRes.body, {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }

    const result = await analyticsService.getSnapshot(userId, query)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk(result.data)
  } catch (e) {
    console.error(e)
    return jsonErr(analyticsRouteErrorMessage(e), 503)
  }
}
