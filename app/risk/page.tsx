"use client"

import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"

export default function RiskPage() {
  const gate = useProtectedPageSession()
  if (gate === "loading") {
    return <div className="text-gray-400">Загрузка…</div>
  }
  if (gate === "guest") {
    return null
  }

  return (
    <div className="text-white">
      <h1 className="text-2xl font-semibold mb-2">Риск‑менеджмент</h1>
      <p className="text-gray-400">Заглушка (этап 4): правила риска + подсветка нарушений.</p>
    </div>
  )
}
