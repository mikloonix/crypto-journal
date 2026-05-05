"use client"

import { useSession } from "next-auth/react"

/**
 * Страницы из `middleware.ts` matcher уже защищены на edge.
 * Не дублируем `router.push("/login")` при `unauthenticated` — избегаем лишних переходов и миганий.
 * Пока сессия грузится — показываем loading; гость на защищённом маршруте (редкий кейс) — пустой фрейм.
 */
export type ProtectedPageGate = "loading" | "guest" | "authed"

export function useProtectedPageSession(): ProtectedPageGate {
  const { status } = useSession()
  if (status === "loading") return "loading"
  if (status === "unauthenticated") return "guest"
  return "authed"
}
