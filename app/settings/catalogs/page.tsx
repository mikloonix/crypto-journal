"use client"

import { SettingsPanels } from "@/features/settings/components/settings-panels"
import { SettingsSubnav } from "@/features/settings/components/settings-subnav"
import { useActiveAccount } from "@/features/trades/active-account-context"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import Link from "next/link"

export default function SettingsCatalogsPage() {
  const gate = useProtectedPageSession()
  const authed = gate === "authed"
  const { refresh: refreshAccounts } = useActiveAccount()

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
      <SettingsPanels
        variant="catalogs"
        authed={authed}
        onCatalogChanged={() => void refreshAccounts()}
      />
      <p className="mt-6 text-sm">
        <Link href="/dashboard" className="text-[var(--accent-blue)] hover:underline">
          К дашборду
        </Link>
      </p>
    </div>
  )
}
