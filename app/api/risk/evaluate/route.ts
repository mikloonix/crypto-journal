import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { handleRouteError } from "@/server/http/handle-route-error"
import { riskEvaluationService } from "@/server/services/risk-evaluation-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }
  try {
    const body = (await req.json()) as unknown
    const result = await riskEvaluationService.evaluate(userId, body)
    if (!result.ok) {
      return jsonErr(result.error, result.status)
    }
    return jsonOk(result.data)
  } catch (e) {
    return handleRouteError(e, "POST risk evaluate error")
  }
}
