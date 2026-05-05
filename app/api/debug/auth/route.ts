import type { NextRequest } from "next/server"
import { getAuthenticatedUserId } from "@/lib/auth-user"

export const dynamic = "force-dynamic"

/** Только development: проверка, видит ли API сессию (без утечки секретов). */
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 })
  }
  const userId = await getAuthenticatedUserId(req)
  return Response.json({
    authenticated: Boolean(userId),
    hasAuthSecret: Boolean(process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET),
  })
}
