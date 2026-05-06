import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import type { AveragingInputPerTradeDto } from "@/contracts/dashboard"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { dashboardService } from "@/server/services/dashboard-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  const accountIdRaw = req.nextUrl.searchParams.get("accountId")
  const accountId = accountIdRaw && accountIdRaw.trim() !== "" ? accountIdRaw.trim() : undefined

  try {
    const result = await dashboardService.getAveragingContext(userId, accountId)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk(result.data)
  } catch (e) {
    console.error(e)
    return jsonErr("GET averaging error", 500)
  }
}

function parseNum(v: unknown): number | null {
  if (v == null || v === "") return null
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : null
}

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  try {
    const body = (await req.json()) as Record<string, unknown>
    const accountIdRaw = body.accountId
    const accountId =
      accountIdRaw != null && String(accountIdRaw).trim() !== ""
        ? String(accountIdRaw).trim()
        : undefined

    const rawInputs = body.inputs
    const inputs: Record<string, AveragingInputPerTradeDto> = {}
    if (rawInputs && typeof rawInputs === "object" && !Array.isArray(rawInputs)) {
      for (const [tradeId, v] of Object.entries(rawInputs as Record<string, unknown>)) {
        if (!tradeId || typeof v !== "object" || v === null || Array.isArray(v)) continue
        const o = v as Record<string, unknown>
        inputs[tradeId] = {
          priceNow: parseNum(o.priceNow),
          price1hAgo: parseNum(o.price1hAgo),
          stopPrice: parseNum(o.stopPrice),
        }
      }
    }

    const data = await dashboardService.computeAveraging(userId, accountId, inputs)
    return jsonOk(data.data)
  } catch (e) {
    console.error(e)
    return jsonErr("POST averaging error", 500)
  }
}
