"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import type {
  AveragingComputeResultDto,
  AveragingContextDto,
  DashboardDayStatsDto,
} from "@/contracts/dashboard"
import {
  getAveragingContext,
  getDashboardDayStats,
  postAveragingCompute,
} from "@/features/trades/api"
import { formatDecimal, formatInQuote } from "@/lib/format-amount"
import { zonedDayBoundsIsoForPreset } from "@/lib/zoned-date-range"
import { useRouter } from "next/navigation"
import { redirectOn401 } from "@/features/trades/session-expired"

function localDayBoundsIso(which: "today" | "yesterday"): { dayStart: string; dayEndExclusive: string } {
  const now = new Date()
  const d = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (which === "yesterday") d.setDate(d.getDate() - 1)
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return { dayStart: d.toISOString(), dayEndExclusive: end.toISOString() }
}

type DayStripProps = {
  authed: boolean
  accountReady: boolean
  journalAllAccounts: boolean
  /** Если журнал не «все счета» — фильтр по активному счёту */
  journalAccountId: string | undefined
  /** IANA из настроек (этап 3); до загрузки — локальная полуночь браузера */
  displayTimeZone?: string | null
  /** Инкремент после мутаций журнала — перезагрузка метрик дня */
  refreshNonce?: number
}

export function DashboardDayStripStage26({
  authed,
  accountReady,
  journalAllAccounts,
  journalAccountId,
  displayTimeZone = null,
  refreshNonce = 0,
}: DayStripProps) {
  const router = useRouter()
  const [preset, setPreset] = useState<"today" | "yesterday">("today")
  const [stats, setStats] = useState<DashboardDayStatsDto | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)

  const bounds = useMemo(() => {
    if (displayTimeZone && displayTimeZone.trim() !== "") {
      try {
        return zonedDayBoundsIsoForPreset(displayTimeZone.trim(), preset)
      } catch {
        /* fallback */
      }
    }
    return localDayBoundsIso(preset)
  }, [displayTimeZone, preset])

  const load = useCallback(async () => {
    if (!authed || !accountReady) return
    setLoadErr(null)
    const q = {
      dayStart: bounds.dayStart,
      dayEndExclusive: bounds.dayEndExclusive,
      ...(journalAllAccounts || !journalAccountId ? {} : { accountId: journalAccountId }),
    }
    const r = await getDashboardDayStats(q)
    if (!r.ok) {
      redirectOn401(router, r.status)
      setStats(null)
      setLoadErr(r.error || "Ошибка загрузки")
      return
    }
    setStats(r.data)
  }, [authed, accountReady, bounds.dayEndExclusive, bounds.dayStart, journalAccountId, journalAllAccounts, router])

  useEffect(() => {
    void load()
  }, [load, refreshNonce])

  if (!authed || !accountReady) return null

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        <button
          type="button"
          className={`rounded px-3 py-1.5 text-sm ${
            preset === "today"
              ? "bg-[var(--accent-blue)] text-white"
              : "border border-[var(--border)] text-[var(--text-secondary)]"
          }`}
          onClick={() => setPreset("today")}
        >
          Сегодня
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1.5 text-sm ${
            preset === "yesterday"
              ? "bg-[var(--accent-blue)] text-white"
              : "border border-[var(--border)] text-[var(--text-secondary)]"
          }`}
          onClick={() => setPreset("yesterday")}
        >
          Вчера
        </button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-[#111] p-4 rounded">
          <p className="text-gray-400 text-sm">PnL за день ({preset === "today" ? "сегодня" : "вчера"})</p>
          {loadErr ? (
            <p className="text-sm text-[var(--accent-red)]">{loadErr}</p>
          ) : stats ? (
            <p className={`text-xl ${stats.pnlUsdt >= 0 ? "text-green-400" : "text-red-400"}`}>
              {formatInQuote(stats.pnlUsdt, stats.displayCurrency)}
            </p>
          ) : (
            <p className="text-gray-400">…</p>
          )}
          {stats ? (
            <p className="mt-1 text-gray-400 text-sm">Сделок за день (выходов): {stats.closedCount}</p>
          ) : null}
        </div>

        <div className="bg-[#111] p-4 rounded">
          <p className="text-gray-400 text-sm">ROI за день</p>
          <p className="text-xl text-gray-400">—</p>
          <p className="mt-1 text-gray-400 text-sm">После портфеля (3.5)</p>
        </div>

        <div className="bg-[#111] p-4 rounded">
          <p className="text-gray-400 text-sm">Отображение</p>
          <p className="text-xl text-[var(--text-primary)]">USDT</p>
          <select
            disabled
            className="mt-2 w-full rounded border border-[var(--border)] bg-[#1a1a1a] px-2 py-1 text-xs text-gray-400"
            aria-label="Валюта (скоро)"
          >
            <option>EUR / RUB — скоро</option>
          </select>
        </div>

        <div className="bg-[#111] p-4 rounded">
          <p className="text-gray-400 text-sm">Цель дня</p>
          <p className="text-sm text-gray-400">Вкладка «Прогноз» — этап 4.5</p>
        </div>
      </div>
    </div>
  )
}

type AveragingProps = {
  authed: boolean
  accountReady: boolean
  journalAllAccounts: boolean
  journalAccountId: string | undefined
  refreshNonce?: number
}

export function DashboardAveragingPanelStage26({
  authed,
  accountReady,
  journalAllAccounts,
  journalAccountId,
  refreshNonce = 0,
}: AveragingProps) {
  const router = useRouter()
  const [ctx, setCtx] = useState<AveragingContextDto | null>(null)
  const [computed, setComputed] = useState<AveragingComputeResultDto | null>(null)
  const [inputs, setInputs] = useState<
    Record<string, { priceNow: string; price1hAgo: string; stopPrice: string }>
  >({})
  const [err, setErr] = useState<string | null>(null)

  const loadCtx = useCallback(async () => {
    if (!authed || !accountReady) return
    setErr(null)
    const q =
      journalAllAccounts || !journalAccountId ? undefined : { accountId: journalAccountId }
    const r = await getAveragingContext(q)
    if (!r.ok) {
      redirectOn401(router, r.status)
      setCtx(null)
      setErr(r.error || "Ошибка")
      return
    }
    setCtx(r.data)
    setInputs((prev) => {
      const next = { ...prev }
      for (const p of r.data.positions) {
        if (!next[p.tradeId]) next[p.tradeId] = { priceNow: "", price1hAgo: "", stopPrice: "" }
      }
      return next
    })
  }, [authed, accountReady, journalAccountId, journalAllAccounts, router])

  useEffect(() => {
    void loadCtx()
  }, [loadCtx, refreshNonce])

  async function recompute() {
    if (!ctx) return
    setErr(null)
    const bodyInputs: Record<string, { priceNow: unknown; price1hAgo: unknown; stopPrice: unknown }> =
      {}
    for (const p of ctx.positions) {
      const row = inputs[p.tradeId] ?? { priceNow: "", price1hAgo: "", stopPrice: "" }
      bodyInputs[p.tradeId] = {
        priceNow: row.priceNow === "" ? null : Number(row.priceNow),
        price1hAgo: row.price1hAgo === "" ? null : Number(row.price1hAgo),
        stopPrice: row.stopPrice === "" ? null : Number(row.stopPrice),
      }
    }
    const r = await postAveragingCompute({
      ...(journalAllAccounts || !journalAccountId ? {} : { accountId: journalAccountId }),
      inputs: bodyInputs,
    })
    if (!r.ok) {
      redirectOn401(router, r.status)
      setErr(r.error || "Ошибка расчёта")
      return
    }
    setComputed(r.data)
  }

  if (!authed || !accountReady) return null

  return (
    <section className="mb-6 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-medium text-[var(--text-primary)]">
          Возможность усреднения (оценка)
        </h2>
        <button
          type="button"
          className="rounded bg-[var(--accent-blue)] px-3 py-1.5 text-sm text-white hover:opacity-90"
          onClick={() => void recompute()}
          disabled={!ctx || ctx.positions.length === 0}
        >
          Пересчитать
        </button>
      </div>
      <p className="mb-3 text-xs text-[var(--text-secondary)]">
        Источник цены: <strong>вручную</strong> (котировки биржи — позже). Цены и стоп не сохраняются.
        Расчёт информационный, не инвестиционная рекомендация.
      </p>
      {err ? <p className="mb-2 text-sm text-[var(--accent-red)]">{err}</p> : null}

      {!ctx ? (
        <p className="text-[var(--text-secondary)]">Загрузка…</p>
      ) : ctx.positions.length === 0 ? (
        <p className="text-[var(--text-secondary)]">Нет открытых позиций в выбранном скоупе журнала.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                <th className="py-2 pr-2">Символ</th>
                <th className="py-2 pr-2">Напр.</th>
                <th className="py-2 pr-2">Ср. вход</th>
                <th className="py-2 pr-2">Плечо</th>
                <th className="py-2 pr-2">Цена сейчас</th>
                <th className="py-2 pr-2">Цена час назад</th>
                <th className="py-2 pr-2">Стоп</th>
                <th className="py-2 pr-2">Зона</th>
                <th className="py-2 pr-2">Откат %</th>
                <th className="py-2 pr-2">1ч %</th>
                <th className="py-2">Δ маржи ~</th>
              </tr>
            </thead>
            <tbody>
              {ctx.positions.map((p) => {
                const computedRow = computed?.rows.find((r) => r.tradeId === p.tradeId)
                const inp = inputs[p.tradeId] ?? { priceNow: "", price1hAgo: "", stopPrice: "" }
                return (
                  <tr key={p.tradeId} className="border-b border-[var(--border)]">
                    <td className="py-2 pr-2 text-[var(--text-primary)]">{p.symbol}</td>
                    <td className="py-2 pr-2">{p.direction}</td>
                    <td className="py-2 pr-2">{formatDecimal(p.avgEntry)}</td>
                    <td className="py-2 pr-2">{p.leverage}×</td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-24 rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-1 py-0.5"
                        value={inp.priceNow}
                        onChange={(e) =>
                          setInputs((prev) => ({
                            ...prev,
                            [p.tradeId]: { ...inp, priceNow: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-24 rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-1 py-0.5"
                        value={inp.price1hAgo}
                        onChange={(e) =>
                          setInputs((prev) => ({
                            ...prev,
                            [p.tradeId]: { ...inp, price1hAgo: e.target.value },
                          }))
                        }
                        placeholder="опц."
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        className="w-24 rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-1 py-0.5"
                        value={inp.stopPrice}
                        onChange={(e) =>
                          setInputs((prev) => ({
                            ...prev,
                            [p.tradeId]: { ...inp, stopPrice: e.target.value },
                          }))
                        }
                      />
                    </td>
                    <td className="py-2 pr-2 text-xs text-[var(--text-secondary)]">
                      {`${formatDecimal(p.safeZoneLow)} … ${formatDecimal(p.safeZoneHigh)}`}
                    </td>
                    <td className="py-2 pr-2">
                      {computedRow?.pullbackPercent != null
                        ? `${formatDecimal(computedRow.pullbackPercent)}%`
                        : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {computedRow?.hourlyReturnPercent != null
                        ? `${formatDecimal(computedRow.hourlyReturnPercent)}%`
                        : "—"}
                    </td>
                    <td className="py-2 text-xs">
                      {computedRow?.suggestedMarginAddUsdt != null
                        ? formatInQuote(computedRow.suggestedMarginAddUsdt, "USDT")
                        : "—"}
                      {computedRow?.warnings?.length ? (
                        <span className="block text-[var(--accent-red)]">
                          {computedRow.warnings.join(" ")}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
