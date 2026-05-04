"use client"

import { type FormEvent, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { BINGX_VIP_MAX_TIER, feeBpsForVipTier } from "@/lib/bingx-vip"

type TradingDefaults = {
  defaultFeeUsdt: number
  makerFeeBps: number
  takerFeeBps: number
  bingxVipTier: number
  maxLeverage: number
}

const VIP_OPTIONS = Array.from({ length: BINGX_VIP_MAX_TIER + 1 }, (_, i) => i)

export default function SettingsPage() {
  const { status } = useSession()
  const router = useRouter()
  const [defaultFee, setDefaultFee] = useState("")
  const [vipTier, setVipTier] = useState(0)
  const [maxLev, setMaxLev] = useState(150)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/settings/trading")
      .then((r) => (r.ok ? r.json() : null))
      .then((d: TradingDefaults | null) => {
        if (!d) return
        setDefaultFee(String(d.defaultFeeUsdt ?? 0))
        setVipTier(Math.min(BINGX_VIP_MAX_TIER, Math.max(0, Math.round(Number(d.bingxVipTier) || 0))))
        setMaxLev(d.maxLeverage ?? 150)
      })
      .catch(console.error)
  }, [status])

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
    const res = await fetch("/api/settings/trading", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        defaultFeeUsdt: n,
        bingxVipTier: vipTier,
      }),
    })
    setSaving(false)
    if (!res.ok) {
      setMsg("Ошибка сохранения")
      return
    }
    const data: TradingDefaults = await res.json()
    setDefaultFee(String(data.defaultFeeUsdt))
    setVipTier(Math.min(BINGX_VIP_MAX_TIER, Math.max(0, Math.round(Number(data.bingxVipTier) || 0))))
    setMsg("Сохранено")
  }

  const previewBps = feeBpsForVipTier(vipTier)

  const commissionsHint =
    "Уровень VIP BingX задаёт maker/taker в bps (номинал × bps / 10 000 на каждую ногу сделки). Официальные ставки на бирже: https://bingx.com/fee — в приложении ориентир по уровням; при расхождении сверяйте с таблицей биржи."

  return (
    <div className="text-white">
      <h1 className="mb-4 text-2xl font-semibold">Настройки</h1>

      <nav className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Разделы настроек">
        <span className="rounded border border-gray-700 bg-gray-900 px-3 py-1.5 text-gray-200">
          Торговые параметры
        </span>
        <Link
          href="/trash"
          className="rounded border border-gray-700 px-3 py-1.5 text-gray-300 hover:border-gray-500 hover:bg-gray-900 hover:text-white"
        >
          Корзина
        </Link>
      </nav>

      <form
        onSubmit={saveTradingDefaults}
        className="max-w-md space-y-4 rounded border border-gray-800 bg-[#111] p-4"
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium text-gray-300">Комиссии</h2>
          <button
            type="button"
            className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-gray-600 text-[11px] font-medium text-gray-400 hover:border-gray-500 hover:bg-gray-900"
            title={commissionsHint}
            aria-label={commissionsHint}
          >
            ?
          </button>
        </div>
        <div>
          <label className="text-xs text-gray-400">VIP BingX (0–{BINGX_VIP_MAX_TIER})</label>
          <select
            value={vipTier}
            onChange={(e) => setVipTier(Number(e.target.value))}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
          >
            {VIP_OPTIONS.map((t) => (
              <option key={t} value={t}>
                VIP {t}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Будут применены: maker {previewBps.makerBps} bps, taker {previewBps.takerBps} bps
          </p>
        </div>
        <div>
          <label className="text-xs text-gray-400">
            Фикс. комиссия USDT (опционально, ручной ввод в форме сделки)
          </label>
          <input
            type="number"
            min={0}
            step="any"
            value={defaultFee}
            onChange={(e) => setDefaultFee(e.target.value)}
            className="mt-1 w-full rounded border border-gray-700 bg-gray-800 px-3 py-2"
          />
        </div>
        <p className="text-xs text-gray-500">Плечо в UI: до {maxLev}×</p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-blue-600 px-4 py-2 text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Сохранение…" : "Сохранить"}
          </button>
          <Link href="/dashboard" className="text-sm text-blue-400 hover:underline">
            К дашборду
          </Link>
        </div>
        {msg && <p className="text-sm text-gray-300">{msg}</p>}
      </form>

      <p className="mt-8 max-w-md text-xs text-gray-500">
        Удалённые трейды и выходы — в{" "}
        <Link href="/trash" className="text-blue-400 hover:underline">
          Корзине
        </Link>
        ; оттуда же восстановление.
      </p>
    </div>
  )
}
