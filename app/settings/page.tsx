"use client"

import { type FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { BINGX_VIP_MAX_TIER, feeBpsForVipTier } from "@/lib/bingx-vip"
import { SettingsSubnav } from "@/features/settings/components/settings-subnav"
import { getTradingDefaults, patchTradingDefaults } from "@/features/trades/api"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import { redirectOn401 } from "@/features/trades/session-expired"

const VIP_OPTIONS = Array.from({ length: BINGX_VIP_MAX_TIER + 1 }, (_, i) => i)

export default function SettingsPage() {
  const router = useRouter()
  const gate = useProtectedPageSession()
  const authed = gate === "authed"
  const [defaultFee, setDefaultFee] = useState("")
  const [vipTier, setVipTier] = useState(0)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!authed) return
    void getTradingDefaults().then((r) => {
      if (!r.ok) {
        redirectOn401(router, r.status)
        return
      }
      const d = r.data
      setDefaultFee(String(d.defaultFeeUsdt ?? 0))
      setVipTier(Math.min(BINGX_VIP_MAX_TIER, Math.max(0, Math.round(Number(d.bingxVipTier) || 0))))
    })
  }, [authed, router])

  async function saveTradingDefaults(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setMsg(null)
    const n = defaultFee === "" ? 0 : Number(defaultFee)
    if (!Number.isFinite(n) || n < 0) {
      setMsg("Некорректная фикс. комиссия")
      setSaving(false)
      return
    }
    const res = await patchTradingDefaults({
      defaultFeeUsdt: n,
      bingxVipTier: vipTier,
    })
    setSaving(false)
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) setMsg(res.error ?? "Ошибка сохранения")
      return
    }
    const data = res.data
    setDefaultFee(String(data.defaultFeeUsdt))
    setVipTier(Math.min(BINGX_VIP_MAX_TIER, Math.max(0, Math.round(Number(data.bingxVipTier) || 0))))
    setMsg("Сохранено")
  }

  const previewBps = feeBpsForVipTier(vipTier)

  const commissionsHint =
    "Уровень VIP BingX задаёт maker/taker в bps (номинал × bps / 10 000 на каждую ногу сделки). Официальные ставки на бирже: https://bingx.com/fee — в приложении ориентир по уровням; при расхождении сверяйте с таблицей биржи."

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

      <form
        onSubmit={saveTradingDefaults}
        className="max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-[var(--text-secondary)]">Комиссии</h2>
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-[var(--border)] text-[11px] font-medium text-[var(--text-secondary)]"
            title={commissionsHint}
            aria-label={commissionsHint}
          >
            ?
          </button>
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)]">
            VIP BingX (0–{BINGX_VIP_MAX_TIER})
          </label>
          <select
            value={vipTier}
            onChange={(e) => setVipTier(Number(e.target.value))}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-[var(--text-primary)]"
          >
            {VIP_OPTIONS.map((t) => (
              <option key={t} value={t}>
                VIP {t}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            Будут применены: maker {previewBps.makerBps} bps, taker {previewBps.takerBps} bps
          </p>
        </div>
        <div>
          <label className="text-xs text-[var(--text-secondary)]">
            Фикс. комиссия USDT (опционально, ручной ввод в форме сделки)
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={defaultFee}
            onChange={(e) => setDefaultFee(e.target.value)}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-[var(--text-primary)]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-[var(--accent-blue)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          <Link href="/dashboard" className="text-sm text-[var(--accent-blue)] hover:underline">
            К дашборду
          </Link>
        </div>
        {msg && <p className="text-sm text-[var(--text-secondary)]">{msg}</p>}
      </form>
    </div>
  )
}
