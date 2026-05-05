"use client"

import { SettingsSubnav } from "@/features/settings/components/settings-subnav"
import { TrashPanel } from "@/features/trash/trash-panel"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import Link from "next/link"

export default function SettingsTrashPage() {
  const gate = useProtectedPageSession()
  const authed = gate === "authed"

  if (gate === "loading") {
    return <div className="text-[var(--text-secondary)]">Загрузка…</div>
  }
  if (gate === "guest") {
    return null
  }

  return (
    <div className="text-[var(--text-primary)]">
      <h1 className="mb-4 text-2xl font-semibold">Настройки</h1>
      <SettingsSubnav />
      <TrashPanel authed={authed} />
      <p className="mt-6 text-sm">
        <Link href="/dashboard" className="text-[var(--accent-blue)] hover:underline">
          К дашборду
        </Link>
      </p>
    </div>
  )
}
