"use client"

import { type FormEvent, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { BINGX_VIP_MAX_TIER, feeBpsForVipTier } from "@/lib/bingx-vip"
import {
  COMMON_IANA_TIME_ZONES,
  isValidIanaTimeZone,
  resolveOffsetStylePresetIana,
  UTC_OFFSET_STYLE_PRESETS,
} from "@/lib/iana-time-zone"
import { SettingsSubnav } from "@/features/settings/components/settings-subnav"
import { getTradingDefaults, patchTradingDefaults } from "@/features/trades/api"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import { redirectOn401 } from "@/features/trades/session-expired"

const VIP_OPTIONS = Array.from({ length: BINGX_VIP_MAX_TIER + 1 }, (_, i) => i)

const formBox = "max-w-md space-y-4 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4"

type TzInputMode = "preset" | "offset" | "custom"

export default function SettingsPage() {
  const router = useRouter()
  const gate = useProtectedPageSession()
  const authed = gate === "authed"
  const [defaultFee, setDefaultFee] = useState("")
  const [vipTier, setVipTier] = useState(0)
  const [savingCommissions, setSavingCommissions] = useState(false)
  const [savingTz, setSavingTz] = useState(false)
  const [msgCommissions, setMsgCommissions] = useState<string | null>(null)
  const [msgTz, setMsgTz] = useState<string | null>(null)
  const [tzPreset, setTzPreset] = useState<string>("UTC")
  const [tzCustom, setTzCustom] = useState("")
  const [tzMode, setTzMode] = useState<TzInputMode>("preset")
  const [tzOffsetIana, setTzOffsetIana] = useState<string>(UTC_OFFSET_STYLE_PRESETS[12]!.iana)

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
      const tz = (d.displayTimeZone && String(d.displayTimeZone).trim()) || "UTC"
      const presets = COMMON_IANA_TIME_ZONES as readonly string[]
      const offsetPick = resolveOffsetStylePresetIana(tz)
      if (offsetPick) {
        setTzMode("offset")
        setTzOffsetIana(offsetPick)
        setTzCustom("")
      } else if (presets.includes(tz)) {
        setTzMode("preset")
        setTzPreset(tz)
        setTzCustom("")
      } else {
        setTzMode("custom")
        setTzCustom(tz)
      }
    })
  }, [authed, router])

  async function saveCommissions(e: FormEvent) {
    e.preventDefault()
    setSavingCommissions(true)
    setMsgCommissions(null)
    const n = defaultFee === "" ? 0 : Number(defaultFee)
    if (!Number.isFinite(n) || n < 0) {
      setMsgCommissions("Некорректная фикс. комиссия")
      setSavingCommissions(false)
      return
    }
    const res = await patchTradingDefaults({
      defaultFeeUsdt: n,
      bingxVipTier: vipTier,
    })
    setSavingCommissions(false)
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) setMsgCommissions(res.error ?? "Ошибка сохранения")
      return
    }
    const data = res.data
    setDefaultFee(String(data.defaultFeeUsdt))
    setVipTier(Math.min(BINGX_VIP_MAX_TIER, Math.max(0, Math.round(Number(data.bingxVipTier) || 0))))
    setMsgCommissions("Сохранено")
  }

  async function saveTimeZone(e: FormEvent) {
    e.preventDefault()
    setSavingTz(true)
    setMsgTz(null)
    let displayTimeZone = ""
    if (tzMode === "preset") displayTimeZone = tzPreset.trim()
    else if (tzMode === "offset") displayTimeZone = tzOffsetIana.trim()
    else displayTimeZone = tzCustom.trim()
    if (!displayTimeZone) {
      setMsgTz("Укажите часовой пояс")
      setSavingTz(false)
      return
    }
    if ((tzMode === "offset" || tzMode === "preset") && !isValidIanaTimeZone(displayTimeZone)) {
      setMsgTz("Некорректная IANA-зона")
      setSavingTz(false)
      return
    }
    if (tzMode === "custom" && !isValidIanaTimeZone(displayTimeZone)) {
      setMsgTz("Некорректная IANA-зона (проверьте написание)")
      setSavingTz(false)
      return
    }
    const res = await patchTradingDefaults({ displayTimeZone })
    setSavingTz(false)
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) setMsgTz(res.error ?? "Ошибка сохранения")
      return
    }
    const data = res.data
    const tz = (data.displayTimeZone && String(data.displayTimeZone).trim()) || "UTC"
    const presets = COMMON_IANA_TIME_ZONES as readonly string[]
    const offsetPick = resolveOffsetStylePresetIana(tz)
    if (offsetPick) {
      setTzMode("offset")
      setTzOffsetIana(offsetPick)
      setTzCustom("")
    } else if (presets.includes(tz)) {
      setTzMode("preset")
      setTzPreset(tz)
      setTzCustom("")
    } else {
      setTzMode("custom")
      setTzCustom(tz)
    }
    setMsgTz("Сохранено")
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

      <form onSubmit={saveCommissions} className={`${formBox} mb-6`}>
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
            disabled={savingCommissions}
            className="rounded bg-[var(--accent-blue)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {savingCommissions ? "Сохранение…" : "Сохранить комиссии"}
          </button>
          <Link href="/dashboard" className="text-sm text-[var(--accent-blue)] hover:underline">
            К дашборду
          </Link>
        </div>
        {msgCommissions ? <p className="text-sm text-[var(--text-secondary)]">{msgCommissions}</p> : null}
      </form>

      <form onSubmit={saveTimeZone} className={formBox}>
        <h2 className="text-sm font-medium text-[var(--text-secondary)]">Часовой пояс</h2>
        <p className="text-xs text-[var(--text-secondary)]">
          Влияет на границы календарного дня на дашборде и группировки на /analytics. Можно выбрать IANA,
          фиксированное смещение UTC/GMT (зона Etc/GMT*) или ввести свой IANA.
        </p>
        <label className="flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="radio"
            name="tz-mode"
            checked={tzMode === "preset"}
            onChange={() => setTzMode("preset")}
            className="border-[var(--border)]"
          />
          Из списка IANA
        </label>
        {tzMode === "preset" ? (
          <select
            value={tzPreset}
            onChange={(e) => setTzPreset(e.target.value)}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-[var(--text-primary)]"
          >
            {COMMON_IANA_TIME_ZONES.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        ) : null}
        <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="radio"
            name="tz-mode"
            checked={tzMode === "offset"}
            onChange={() => setTzMode("offset")}
            className="border-[var(--border)]"
          />
          По смещению UTC (города)
        </label>
        {tzMode === "offset" ? (
          <select
            value={tzOffsetIana}
            onChange={(e) => setTzOffsetIana(e.target.value)}
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-[var(--text-primary)]"
          >
            {UTC_OFFSET_STYLE_PRESETS.map((p) => (
              <option key={p.iana} value={p.iana}>
                {p.labelRu} — {p.iana}
              </option>
            ))}
          </select>
        ) : null}
        <label className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
          <input
            type="radio"
            name="tz-mode"
            checked={tzMode === "custom"}
            onChange={() => setTzMode("custom")}
            className="border-[var(--border)]"
          />
          Свой IANA
        </label>
        {tzMode === "custom" ? (
          <input
            type="text"
            value={tzCustom}
            onChange={(e) => setTzCustom(e.target.value)}
            placeholder="Europe/Moscow"
            className="mt-1 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-2 text-[var(--text-primary)]"
          />
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={savingTz}
            className="rounded bg-[var(--accent-blue)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            {savingTz ? "Сохранение…" : "Сохранить часовой пояс"}
          </button>
        </div>
        {msgTz ? <p className="text-sm text-[var(--text-secondary)]">{msgTz}</p> : null}
      </form>
    </div>
  )
}
