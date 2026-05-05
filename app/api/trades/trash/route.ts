import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"
import { jsonErr, jsonOk } from "@/server/http/json-response"
import { trashService } from "@/server/services/trash-service"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(req: NextRequest) {
  const userId = await getAuthenticatedUserId(req)
  if (!userId) {
    return jsonErr("Unauthorized", 401)
  }

  try {
    const data = await trashService.getTrash(userId)
    return jsonOk(data)
  } catch (e) {
    console.error(e)
    return jsonErr("GET trash error", 500)
  }
}
