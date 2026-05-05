"use client"

import { useSession } from "next-auth/react"

/**
 * Страницы из `middleware.ts` matcher уже защищены на edge.
 * Не дублируем `router.push("/login")` при `unauthenticated` — избегаем лишних переходов и миганий.
 * Пока сессия грузится — показываем loading; гость на защищённом маршруте (редкий кейс) — пустой фрейм.
 *
 * Важно: при фоновом refetch next-auth иногда даёт `status === "loading"` при ещё валидной сессии.
 * Если гейтить только по `status`, дочерний UI размонтируется и теряет локальный state (например списки в настройках).
 */
export type ProtectedPageGate = "loading" | "guest" | "authed"

export function useProtectedPageSession(): ProtectedPageGate {
  const { data: session, status } = useSession()
  if (session) return "authed"
  if (status === "unauthenticated") return "guest"
  if (status === "loading") return "loading"
  return "guest"
}
