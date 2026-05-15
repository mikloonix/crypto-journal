"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import type { RiskSettingsDto } from "@/contracts/risk"
import {
  getRiskSettings,
  patchRiskSettings,
  postRiskSyncBalance,
} from "@/features/risk/api"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import { suggestMarginFromRisk } from "@/lib/risk-position-calc"
import { formatDecimal, formatInQuote } from "@/lib/format-amount"

export default function RiskPage() {
  const gate = useProtectedPageSession()
  const authed = gate === "authed"

  const [settings, setSettings] = useState<RiskSettingsDto | null>(null)
  const [portfolioBalance, setPortfolioBalance] = useState<number | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const [accountBalance, setAccountBalance] = useState("")
  const [riskPerTrade, setRiskPerTrade] = useState("")
  const [riskPerDay, setRiskPerDay] = useState("")
  const [maxDrawdown, setMaxDrawdown] = useState("")
  const [maxOpenRisk, setMaxOpenRisk] = useState("")

  const [calcEntry, setCalcEntry] = useState("")
  const [calcStop, setCalcStop] = useState("")
  const [calcLeverage, setCalcLeverage] = useState("10")

  const refresh = useCallback(async () => {
    const r = await getRiskSettings()
    if (!r.ok) {
      setFormError(r.error ?? "Ошибка загрузки")
      return
    }
    const s = r.data.settings
    setSettings(s)
    setPortfolioBalance(r.data.portfolio.balanceEstimateUsdt)
    setAccountBalance(String(s.accountBalance))
    setRiskPerTrade(String(s.riskPerTrade))
    setRiskPerDay(String(s.riskPerDay))
    setMaxDrawdown(String(s.maxDrawdown))
    setMaxOpenRisk(String(s.maxOpenRisk))
    setFormError(null)
  }, [])

  useEffect(() => {
    if (!authed) return
    setLoading(true)
    void refresh().finally(() => setLoading(false))
  }, [authed, refresh])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const body = {
      accountBalance: Number(accountBalance),
      riskPerTrade: Number(riskPerTrade),
      riskPerDay: Number(riskPerDay),
      maxDrawdown: Number(maxDrawdown),
      maxOpenRisk: Number(maxOpenRisk),
    }
    const r = await patchRiskSettings(body)
    if (!r.ok) {
      setFormError(r.error ?? "Ошибка сохранения")
      return
    }
    setSettings(r.data)
  }

  async function onSyncBalance() {
    setFormError(null)
    const r = await postRiskSyncBalance()
    if (!r.ok) {
      setFormError(r.error ?? "Не удалось синхронизировать")
      return
    }
    setAccountBalance(String(r.data.accountBalance))
    setSettings(r.data)
    setPortfolioBalance(r.data.syncedBalanceUsdt)
  }

  const calc =
    settings &&
    suggestMarginFromRisk({
      accountBalance: settings.accountBalance,
      riskPerTradePercent: settings.riskPerTrade,
      entryPrice: Number(calcEntry),
      stopPrice: Number(calcStop),
      leverage: Number(calcLeverage),
    })

  if (gate === "loading" || loading) {
    return <div className="text-[var(--text-secondary)]">Загрузка…</div>
  }
  if (gate === "guest") return null

  return (
    <div className="text-[var(--text-primary)]">
      <h1 className="mb-2 text-2xl font-semibold">Риск‑менеджмент</h1>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        Лимиты риска и калькулятор позиции. Депозит вручную или из оценки портфеля (cashflow + PnL).
      </p>

      <form
        onSubmit={onSubmit}
        className="mb-8 grid max-w-3xl grid-cols-1 gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">Депозит (USDT)</span>
          <input
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 tabular-nums"
            value={accountBalance}
            onChange={(e) => setAccountBalance(e.target.value)}
          />
        </label>
        <div className="flex items-end">
          <button
            type="button"
            onClick={() => void onSyncBalance()}
            className="rounded-lg border border-[var(--border)] px-3 py-2 text-sm hover:bg-white/5"
          >
            Синхронизировать с портфелем
            {portfolioBalance != null ? ` (${formatInQuote(portfolioBalance, "USDT")})` : ""}
          </button>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">Риск на сделку (%)</span>
          <input
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            value={riskPerTrade}
            onChange={(e) => setRiskPerTrade(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">Риск на день (%)</span>
          <input
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            value={riskPerDay}
            onChange={(e) => setRiskPerDay(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">Макс. просадка (%)</span>
          <input
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            value={maxDrawdown}
            onChange={(e) => setMaxDrawdown(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">Макс. риск OPEN (%)</span>
          <input
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            value={maxOpenRisk}
            onChange={(e) => setMaxOpenRisk(e.target.value)}
          />
        </label>
        {formError ? (
          <p className="text-sm text-[var(--accent-red)] md:col-span-2">{formError}</p>
        ) : null}
        <button
          type="submit"
          className="md:col-span-2 rounded-lg bg-[var(--accent-green)] px-4 py-2 text-sm font-medium text-[var(--background)]"
        >
          Сохранить лимиты
        </button>
      </form>

      <div className="max-w-3xl rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 text-lg font-medium">Калькулятор позиции</h2>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">Цена входа</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
              value={calcEntry}
              onChange={(e) => setCalcEntry(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">Стоп</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
              value={calcStop}
              onChange={(e) => setCalcStop(e.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">Плечо</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
              value={calcLeverage}
              onChange={(e) => setCalcLeverage(e.target.value)}
            />
          </label>
        </div>
        {calc ? (
          <ul className="mt-4 space-y-1 text-sm tabular-nums">
            <li>Риск на сделку: {formatInQuote(calc.riskUsdt, "USDT")}</li>
            <li>Рекомендуемая маржа: {formatInQuote(calc.marginUsdt, "USDT")}</li>
            <li>Номинал: {formatInQuote(calc.notionalUsdt, "USDT")}</li>
          </ul>
        ) : (
          <p className="mt-4 text-sm text-[var(--text-secondary)]">
            Укажите цену входа, стоп и плечо для расчёта.
          </p>
        )}
      </div>
    </div>
  )
}
