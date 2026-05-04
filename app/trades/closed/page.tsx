"use client"

import { Fragment, useEffect, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { TradeStatus } from "@prisma/client"
import type { Exit } from "@prisma/client"
import type { TradeWithLegs } from "@/components/EquityChart"
import { calculateTradePnL, calculateVolumes } from "@/lib/risk-manager"
import { pnlRoiForExitLeg } from "@/lib/exit-leg-pnl"
import { formatInQuote, formatPercent } from "@/lib/format-amount"
import { quoteCurrencyFromSymbol } from "@/lib/quote-currency"

type ViewMode = "trades" | "exits"

type ExitRow = { exit: Exit; trade: TradeWithLegs }

export default function ClosedTradesPage() {
  const { status } = useSession()
  const router = useRouter()
  const [trades, setTrades] = useState<TradeWithLegs[]>([])
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [view, setView] = useState<ViewMode>("trades")

  useEffect(() => {
    if (status === "unauthenticated") router.push("/login")
  }, [status, router])

  async function loadTrades(): Promise<boolean> {
    const r = await fetch("/api/trades", { cache: "no-store", credentials: "include" })
    if (r.status === 401) {
      router.push("/login")
      return false
    }
    if (!r.ok) return false
    const ct = r.headers.get("content-type") ?? ""
    if (!ct.includes("application/json")) return false
    const data = await r.json().catch(() => null)
    if (!Array.isArray(data)) return false
    setTrades(data)
    return true
  }

  async function deleteTradeToTrash(id: string) {
    if (!confirm("Удалить весь трейд в корзину?")) return
    const res = await fetch("/api/trades/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    })
    if (res.status === 401) {
      router.push("/login")
      return
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert((err as { error?: string }).error ?? "Не удалось удалить")
      return
    }
    setTrades((prev) => prev.filter((t) => t.id !== id))
    void loadTrades()
  }

  async function deleteExitToTrash(tradeId: string, exitId: string) {
    if (!confirm("Удалить эту сделку (выход) в корзину?")) return
    const res = await fetch("/api/trades/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id: tradeId, exitId }),
    })
    if (res.status === 401) {
      router.push("/login")
      return
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert((err as { error?: string }).error ?? "Не удалось удалить")
      return
    }
    void loadTrades()
  }

  useEffect(() => {
    if (status !== "authenticated") return
    void loadTrades()

    const onVisible = () => {
      if (document.visibilityState === "visible") void loadTrades()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const closed = trades.filter((t) => t.status === TradeStatus.CLOSED)

  const exitRows: ExitRow[] = useMemo(() => {
    const rows: ExitRow[] = []
    for (const t of trades) {
      for (const x of t.exits) {
        rows.push({ exit: x, trade: t })
      }
    }
    rows.sort(
      (a, b) => new Date(b.exit.timestamp).getTime() - new Date(a.exit.timestamp).getTime(),
    )
    return rows
  }, [trades])

  return (
    <div className="text-white">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Закрытые</h1>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded border border-gray-700 p-0.5 text-sm">
            <button
              type="button"
              onClick={() => setView("trades")}
              className={`rounded px-3 py-1 ${view === "trades" ? "bg-gray-700 text-white" : "text-gray-400"}`}
            >
              Трейды
            </button>
            <button
              type="button"
              onClick={() => setView("exits")}
              className={`rounded px-3 py-1 ${view === "exits" ? "bg-gray-700 text-white" : "text-gray-400"}`}
            >
              Сделки (выходы)
            </button>
          </div>
          <button
            type="button"
            onClick={() => loadTrades()}
            className="rounded bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700"
          >
            Обновить
          </button>
        </div>
      </div>

      {view === "trades" ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="py-2 pr-2">Символ</th>
                <th className="py-2 pr-2">Напр.</th>
                <th className="py-2 pr-2">Маржа</th>
                <th className="py-2 pr-2">Вход (ср.)</th>
                <th className="py-2 pr-2">Выход (ср.)</th>
                <th className="py-2 pr-2">PnL</th>
                <th className="py-2 pr-2">ROI</th>
                <th className="py-2 pr-2">Закрыто</th>
                <th className="py-2 pr-2">Детали</th>
                <th className="py-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {closed.map((t) => {
                const q = quoteCurrencyFromSymbol(t.symbol)
                const pnl = calculateTradePnL(t)
                const { entryVolume } = calculateVolumes(t)
                const entryValue = t.entries.reduce((s, e) => s + e.price * e.volume, 0)
                const exitValue = t.exits.reduce((s, e) => s + e.price * e.volume, 0)
                const avgEntry = entryVolume > 0 ? entryValue / entryVolume : 0
                const avgExit =
                  t.exits.length > 0 ? exitValue / t.exits.reduce((s, e) => s + e.volume, 0) : null
                const notional = entryValue
                const roi = notional > 0 ? (pnl / notional) * 100 : 0

                return (
                  <Fragment key={t.id}>
                    <tr className="border-b border-gray-900">
                      <td className="py-2 pr-2">{t.symbol}</td>
                      <td className="py-2 pr-2">{t.direction}</td>
                      <td className="py-2 pr-2">{formatInQuote(entryVolume, q)}</td>
                      <td className="py-2 pr-2">{avgEntry ? formatInQuote(avgEntry, q) : "—"}</td>
                      <td className="py-2 pr-2">
                        {avgExit != null ? formatInQuote(avgExit, q) : "—"}
                      </td>
                      <td className={pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : ""}>
                        {formatInQuote(pnl, q)}
                      </td>
                      <td className={roi > 0 ? "text-green-400" : roi < 0 ? "text-red-400" : ""}>
                        {formatPercent(roi)}%
                      </td>
                      <td className="py-2 pr-2">
                        {t.closedAt ? new Date(t.closedAt).toLocaleString() : "—"}
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => setExpanded((p) => ({ ...p, [t.id]: !(p[t.id] ?? false) }))}
                          className="rounded bg-gray-800 px-2 py-1 text-xs hover:bg-gray-700"
                        >
                          {expanded[t.id] ? "Скрыть" : "Показать"}
                        </button>
                      </td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() => deleteTradeToTrash(t.id)}
                          className="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
                        >
                          Удалить трейд
                        </button>
                      </td>
                    </tr>
                    {expanded[t.id] && (
                      <tr className="border-b border-gray-900 bg-[#0b0b0b]">
                        <td colSpan={10} className="py-3">
                          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                            <div>
                              <div className="mb-2 text-xs text-gray-400">Входы</div>
                              <div className="space-y-1 text-xs">
                                {t.entries
                                  .slice()
                                  .sort(
                                    (a, b) =>
                                      new Date(a.timestamp).getTime() -
                                      new Date(b.timestamp).getTime(),
                                  )
                                  .map((e) => (
                                    <div key={e.id} className="flex flex-wrap justify-between gap-2">
                                      <span className="text-gray-400">
                                        {new Date(e.timestamp).toLocaleString()}
                                      </span>
                                      <span>{formatInQuote(e.price, q)}</span>
                                      <span>{formatInQuote(e.volume, q)}</span>
                                      <span>
                                        fee{" "}
                                        {e.fee != null ? formatInQuote(Number(e.fee), q) : "—"}
                                      </span>
                                      <span>{e.liquidityRole}</span>
                                    </div>
                                  ))}
                              </div>
                            </div>
                            <div>
                              <div className="mb-2 text-xs text-gray-400">Выходы (каждая сделка)</div>
                              <div className="space-y-1 text-xs">
                                {t.exits.length === 0 ? (
                                  <div className="text-gray-500">Нет выходов</div>
                                ) : (
                                  t.exits
                                    .slice()
                                    .sort(
                                      (a, b) =>
                                        new Date(a.timestamp).getTime() -
                                        new Date(b.timestamp).getTime(),
                                    )
                                    .map((x) => (
                                      <div
                                        key={x.id}
                                        className="flex flex-wrap justify-between gap-2 text-gray-200"
                                      >
                                        <span className="text-gray-400">
                                          {new Date(x.timestamp).toLocaleString()}
                                        </span>
                                        <span>{formatInQuote(x.price, q)}</span>
                                        <span>{formatInQuote(x.volume, q)}</span>
                                        <span>
                                          fee{" "}
                                          {x.fee != null ? formatInQuote(Number(x.fee), q) : "—"}
                                        </span>
                                        <span>
                                          fnd{" "}
                                          {x.funding != null
                                            ? formatInQuote(Number(x.funding), q)
                                            : "—"}
                                        </span>
                                        <span>{x.liquidityRole}</span>
                                        <span className="text-gray-300">
                                          эмоц.: {x.emotionExit ?? "—"}
                                        </span>
                                      </div>
                                    ))
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 text-xs text-gray-400">
                            strategy: <span className="text-gray-200">{t.strategy ?? "—"}</span> ·
                            эмоция входа (трейд):{" "}
                            <span className="text-gray-200">{t.emotionEntry ?? "—"}</span> ·
                            эмоция выхода (последняя в трейде):{" "}
                            <span className="text-gray-200">{t.emotionExit ?? "—"}</span> · fee
                            сумм.:{" "}
                            <span className="text-gray-200">
                              {t.fee != null ? formatInQuote(Number(t.fee), q) : "—"}
                            </span>{" "}
                            · funding:{" "}
                            <span className="text-gray-200">
                              {t.funding != null ? formatInQuote(Number(t.funding), q) : "—"}
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <p className="mb-2 text-xs text-gray-500">
            Каждая строка — один выход (частичное или полное закрытие). Трейд может быть ещё OPEN.
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-left text-gray-400">
                <th className="py-2 pr-2">Время</th>
                <th className="py-2 pr-2">Символ</th>
                <th className="py-2 pr-2">Трейд</th>
                <th className="py-2 pr-2">Напр.</th>
                <th className="py-2 pr-2">Цена</th>
                <th className="py-2 pr-2">Маржа</th>
                <th className="py-2 pr-2">M/T</th>
                <th className="py-2 pr-2">Комиссия</th>
                <th className="py-2 pr-2">Фандинг</th>
                <th className="py-2 pr-2">PnL</th>
                <th className="py-2 pr-2">ROI</th>
                <th className="py-2 pr-2">Эмоция выхода</th>
                <th className="py-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {exitRows.map(({ exit: x, trade: t }) => {
                const q = quoteCurrencyFromSymbol(t.symbol)
                const { pnl, roiPct } = pnlRoiForExitLeg(t.direction, t.entries, x)
                return (
                  <tr key={x.id} className="border-b border-gray-900">
                    <td className="py-2 pr-2 text-gray-400">
                      {new Date(x.timestamp).toLocaleString()}
                    </td>
                    <td className="py-2 pr-2">{t.symbol}</td>
                    <td className="py-2 pr-2 font-mono text-xs text-gray-500">{t.id.slice(0, 8)}…</td>
                    <td className="py-2 pr-2">{t.direction}</td>
                    <td className="py-2 pr-2">{formatInQuote(x.price, q)}</td>
                    <td className="py-2 pr-2">{formatInQuote(x.volume, q)}</td>
                    <td className="py-2 pr-2">{x.liquidityRole}</td>
                    <td className="py-2 pr-2">
                      {x.fee != null ? formatInQuote(Number(x.fee), q) : "—"}
                    </td>
                    <td className="py-2 pr-2">
                      {x.funding != null ? formatInQuote(Number(x.funding), q) : "—"}
                    </td>
                    <td className={pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : ""}>
                      {formatInQuote(pnl, q)}
                    </td>
                    <td className={roiPct > 0 ? "text-green-400" : roiPct < 0 ? "text-red-400" : ""}>
                      {formatPercent(roiPct)}%
                    </td>
                    <td className="py-2 pr-2 text-gray-200">{x.emotionExit ?? "—"}</td>
                    <td className="py-2">
                      <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap">
                        <button
                          type="button"
                          title="Только этот выход"
                          onClick={() => deleteExitToTrash(t.id, x.id)}
                          className="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
                        >
                          Удалить сделку
                        </button>
                        <button
                          type="button"
                          title="Весь трейд"
                          onClick={() => deleteTradeToTrash(t.id)}
                          className="rounded bg-gray-600 px-2 py-1 text-xs hover:bg-gray-500"
                        >
                          Удалить трейд
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {exitRows.length === 0 && (
            <p className="mt-4 text-center text-gray-500">Пока нет ни одного выхода</p>
          )}
        </div>
      )}
    </div>
  )
}
