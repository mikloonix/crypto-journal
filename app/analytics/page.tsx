"use client"

import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"

export default function AnalyticsPage() {
  const gate = useProtectedPageSession()
  if (gate === "loading") {
    return <div className="text-gray-400">Загрузка…</div>
  }
  if (gate === "guest") {
    return null
  }

  return (
    <div className="text-white">
      <h1 className="text-2xl font-semibold mb-2">Аналитика</h1>
      <p className="text-gray-400">Заглушка (этап 3): метрики, фильтры, графики.</p>
    </div>
  )
}
