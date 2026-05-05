import { getServerSession } from "next-auth"
import { getToken } from "next-auth/jwt"
import { cookies, headers } from "next/headers"
import type { NextRequest } from "next/server"
import { authOptions } from "@/lib/auth"
import type { JWT } from "next-auth/jwt"

function pickUserIdFromJwt(token: JWT | null): string | null {
  if (!token) return null
  const id = (token as JWT & { id?: string }).id ?? token.sub
  return typeof id === "string" && id.length > 0 ? id : null
}

async function getTokenFromCookieStore(secret: string): Promise<string | null> {
  try {
    const cookieStore = await cookies()
    const headerList = await headers()
    const synthetic = {
      headers: Object.fromEntries(headerList.entries()),
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
      },
    }
    const token = await getToken({ req: synthetic as unknown as NextRequest, secret })
    return pickUserIdFromJwt(token)
  } catch (e) {
    console.error("[auth] getToken(cookies):", e)
    return null
  }
}

/**
 * ID пользователя в Route Handlers.
 * В App Router надёжнее всего читать JWT через cookies()/headers() — тот же способ, что у клиентского fetch.
 */
export async function getAuthenticatedUserId(req?: NextRequest | Request): Promise<string | null> {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET
  if (!secret) {
    if (process.env.NODE_ENV === "development") {
      console.error("[auth] Задай NEXTAUTH_SECRET (или AUTH_SECRET) в .env")
    }
    return null
  }

  const fromCookies = await getTokenFromCookieStore(secret)
  if (fromCookies) return fromCookies

  if (req) {
    try {
      const token = await getToken({ req: req as NextRequest, secret })
      const id = pickUserIdFromJwt(token)
      if (id) return id
    } catch (e) {
      console.error("[auth] getToken(incoming Request):", e)
    }
  }

  try {
    const session = await getServerSession(authOptions)
    if (session?.user?.id) return session.user.id
  } catch (e) {
    console.error("[auth] getServerSession:", e)
  }

  return null
}
