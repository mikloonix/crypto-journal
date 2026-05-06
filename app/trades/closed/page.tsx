"use client"

import { Fragment, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import type { ExitDto, TradeListItemDto } from "@/contracts/trades"
import { ClosedTradesMobileCards } from "@/features/trades/components/closed-trades-mobile-cards"
import { getJournalStrategyValues, getJournalSymbols, postDeleteTrade } from "@/features/trades/api"
import {
  HEADER_ALL_ACCOUNTS_VALUE,
  useActiveAccount,
} from "@/features/trades/active-account-context"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import { useTradesJournal } from "@/features/trades/hooks/use-trades-journal"
import {
  groupClosedExitsByPeriod,
  groupClosedTradesByPeriod,
  type JournalGroupMode,
} from "@/features/trades/journal-grouping"
import { redirectOn401 } from "@/features/trades/session-expired"
import { formatDecimal, formatInQuote, formatPercent } from "@/lib/format-amount"
import { formatDurationMs } from "@/lib/format-duration"
import { quoteCurrencyFromSymbol } from "@/lib/quote-currency"

type ViewMode = "trades" | "exits"

type ExitRow = { exit: ExitDto; trade: TradeListItemDto }

type PeriodPreset = "all" | "today" | "week" | "month" | "custom"

const TRADES_COL_SPAN = 18
function formatGroupAggPnl(trades: TradeListItemDto[], sumPnl: number): string {
  const qs = new Set(trades.map((t) => quoteCurrencyFromSymbol(t.symbol)))
  if (qs.size === 1) {
    return formatInQuote(sumPnl, [...qs][0]!)
  }
  return formatDecimal(sumPnl)
}

function formatExitGroupAggPnl(rows: ExitRow[], sumPnl: number): string {
  const qs = new Set(rows.map((r) => quoteCurrencyFromSymbol(r.trade.symbol)))
  if (qs.size === 1) {
    return formatInQuote(sumPnl, [...qs][0]!)
  }
  return formatDecimal(sumPnl)
}

function periodToRange(
  preset: PeriodPreset,
  customFrom: string,
  customTo: string,
): { from?: string; to?: string } {
  const now = new Date()
  if (preset === "all") return {}
  if (preset === "today") {
    return { from: startOfDay(now).toISOString(), to: endOfDay(now).toISOString() }
  }
  if (preset === "week") {
    return {
      from: startOfWeek(now, { weekStartsOn: 1 }).toISOString(),
      to: endOfWeek(now, { weekStartsOn: 1 }).toISOString(),
    }
  }
  if (preset === "month") {
    return { from: startOfMonth(now).toISOString(), to: endOfMonth(now).toISOString() }
  }
  if (!customFrom || !customTo) return {}
  const df = new Date(customFrom)
  const dt = new Date(customTo)
  if (!Number.isFinite(df.getTime()) || !Number.isFinite(dt.getTime())) return {}
  return { from: startOfDay(df).toISOString(), to: endOfDay(dt).toISOString() }
}

export default function ClosedTradesPage() {
  const router = useRouter()
  const gate = useProtectedPageSession()
  const authed = gate === "authed"
  const {
    ready: accountReady,
    journalAllAccounts,
    resolvedActiveAccountId,
    accounts,
  } = useActiveAccount()

  /** Фильтр счёта только для страницы «Закрытые» (не связан с шапкой). */
  const [closedAccountFilter, setClosedAccountFilter] = useState<string | null>(null)
  const closedAccountSeeded = useRef(false)

  useEffect(() => {
    if (!accountReady || closedAccountSeeded.current) return
    closedAccountSeeded.current = true
    setClosedAccountFilter(
      journalAllAccounts
        ? HEADER_ALL_ACCOUNTS_VALUE
        : (resolvedActiveAccountId ?? HEADER_ALL_ACCOUNTS_VALUE),
    )
  }, [accountReady, journalAllAccounts, resolvedActiveAccountId])

  const effectiveClosedAccount =
    closedAccountFilter ??
    (journalAllAccounts
      ? HEADER_ALL_ACCOUNTS_VALUE
      : (resolvedActiveAccountId ?? HEADER_ALL_ACCOUNTS_VALUE))

  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>("all")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [filterSymbol, setFilterSymbol] = useState("")
  const [filterStrategy, setFilterStrategy] = useState("")
  const [filterMarket, setFilterMarket] = useState<"" | "SPOT" | "FUTURE">("")
  const [groupMode, setGroupMode] = useState<JournalGroupMode>("none")
  const [closedSymbols, setClosedSymbols] = useState<string[]>([])
  const [closedStrategies, setClosedStrategies] = useState<string[]>([])
  const [view, setView] = useState<ViewMode>("trades")

  const listQuery = useMemo(() => {
    const q: Record<string, string> = {}
    const { from, to } = periodToRange(periodPreset, customFrom, customTo)
    if (from) q.from = from
    if (to) q.to = to
    if (view === "exits") {
      q.dateBasis = "exitAt"
    } else {
      q.status = "CLOSED"
      q.dateBasis = "closedAt"
    }
    if (filterSymbol.trim()) q.symbol = filterSymbol.trim()
    if (filterStrategy.trim()) q.strategy = filterStrategy.trim()
    if (filterMarket) q.marketType = filterMarket
    if (
      effectiveClosedAccount !== HEADER_ALL_ACCOUNTS_VALUE &&
      effectiveClosedAccount
    ) {
      q.accountId = effectiveClosedAccount
    }
    return q
  }, [
    view,
    periodPreset,
    customFrom,
    customTo,
    filterSymbol,
    filterStrategy,
    filterMarket,
    effectiveClosedAccount,
  ])

  const { trades, setTrades, refresh } = useTradesJournal(authed && accountReady, listQuery)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const groupedTrades = useMemo(
    () => groupClosedTradesByPeriod(trades, groupMode),
    [trades, groupMode],
  )

  async function deleteTradeToTrash(id: string) {
    if (!confirm("Удалить весь трейд в корзину?")) return
    const res = await postDeleteTrade({ id })
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) alert(res.error ?? "Не удалось удалить")
      return
    }
    setTrades((prev) => prev.filter((t) => t.id !== id))
    void refresh()
  }

  async function deleteExitToTrash(tradeId: string, exitId: string) {
    if (!confirm("Удалить эту сделку (выход) в корзину?")) return
    const res = await postDeleteTrade({ id: tradeId, exitId })
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) alert(res.error ?? "Не удалось удалить")
      return
    }
    void refresh()
  }

  useEffect(() => {
    if (!authed) return
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [authed, refresh])

  useEffect(() => {
    if (!authed || !accountReady) return
    void getJournalSymbols().then((r) => {
      if (r.ok) setClosedSymbols(r.data.symbols)
    })
    void getJournalStrategyValues().then((r) => {
      if (r.ok) setClosedStrategies(r.data.strategies)
    })
  }, [authed, accountReady])

  const exitRows: ExitRow[] = useMemo(() => {
    const { from, to } = periodToRange(periodPreset, customFrom, customTo)
    const fromMs = from ? new Date(from).getTime() : undefined
    const toMs = to ? new Date(to).getTime() : undefined
    const rows: ExitRow[] = []
    for (const t of trades) {
      for (const x of t.exits) {
        const ts = new Date(x.timestamp).getTime()
        if (fromMs != null && ts < fromMs) continue
        if (toMs != null && ts > toMs) continue
        rows.push({ exit: x, trade: t })
      }
    }
    rows.sort(
      (a, b) => new Date(b.exit.timestamp).getTime() - new Date(a.exit.timestamp).getTime(),
    )
    return rows
  }, [trades, periodPreset, customFrom, customTo])

  const groupedExits = useMemo(
    () => groupClosedExitsByPeriod(exitRows, groupMode),
    [exitRows, groupMode],
  )

  if (gate === "loading") {
    return <div className="text-[var(--text-secondary)]">Загрузка…</div>
  }
  if (gate === "guest") {
    return null
  }

  if (!accountReady) {
    return <div className="text-[var(--text-secondary)]">Подготовка счёта…</div>
  }

  return (
    <div className="text-[var(--text-primary)]">
      <div className="mb-4 space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
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
                Сделки
              </button>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="rounded bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700"
            >
              Обновить
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500">
          Трейды — только полностью закрытые позиции. Сделки — каждый выход по времени (в т.ч. частичный, пока
          позиция ещё открыта).
        </p>
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-lg border border-gray-800 bg-[#0b0b0b] p-3 text-sm">
        <div className="flex flex-wrap gap-2">
          <span className="text-gray-500">Период:</span>
          {(
            [
              ["all", "Всё"],
              ["today", "Сегодня"],
              ["week", "Неделя"],
              ["month", "Месяц"],
              ["custom", "Свой"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setPeriodPreset(key)}
              className={`rounded px-2 py-1 text-xs ${
                periodPreset === key ? "bg-gray-700 text-white" : "bg-gray-800 text-gray-400"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {periodPreset === "custom" && (
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-gray-500">
              От{" "}
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="ml-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-200"
              />
            </label>
            <label className="text-gray-500">
              До{" "}
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="ml-1 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-200"
              />
            </label>
          </div>
        )}
        <div className="flex flex-wrap gap-2 gap-y-2">
          <select
            value={effectiveClosedAccount}
            onChange={(e) => setClosedAccountFilter(e.target.value)}
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[var(--text-primary)]"
            aria-label="Фильтр по счёту (только закрытые)"
          >
            <option value={HEADER_ALL_ACCOUNTS_VALUE}>Все счета</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.isDefault ? `${a.name} (по умолч.)` : a.name}
              </option>
            ))}
          </select>
          <input
            value={filterSymbol}
            onChange={(e) => setFilterSymbol(e.target.value)}
            placeholder="Символ"
            list="closed-trades-symbols"
            className="w-32 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-200"
          />
          <datalist id="closed-trades-symbols">
            {closedSymbols.map((sym) => (
              <option key={sym} value={sym} />
            ))}
          </datalist>
          <input
            value={filterStrategy}
            onChange={(e) => setFilterStrategy(e.target.value)}
            placeholder="Стратегия"
            list="closed-trades-strategies"
            className="w-40 rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-200"
          />
          <datalist id="closed-trades-strategies">
            {closedStrategies.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          <select
            value={filterMarket}
            onChange={(e) => setFilterMarket(e.target.value as "" | "SPOT" | "FUTURE")}
            className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-200"
          >
            <option value="">Рынок: все</option>
            <option value="SPOT">SPOT</option>
            <option value="FUTURE">FUTURE</option>
          </select>
          <>
            <span className="self-center text-gray-600">|</span>
            <span className="self-center text-gray-500">Группировка:</span>
            <select
              value={groupMode}
              onChange={(e) => setGroupMode(e.target.value as JournalGroupMode)}
              className="rounded border border-gray-700 bg-gray-900 px-2 py-1 text-gray-200"
            >
              <option value="none">Нет</option>
              <option value="day">По дням</option>
              <option value="week">По неделям</option>
              <option value="month">По месяцам</option>
            </select>
          </>
        </div>
      </div>

      {view === "trades" ? (
        <>
          {/* max-md + md: дублируем на странице: классы из app/ всегда в бандле Tailwind */}
          <div className="block md:hidden">
            <ClosedTradesMobileCards
              groups={groupedTrades}
              groupMode={groupMode}
              expanded={expanded}
              setExpanded={setExpanded}
              onDeleteTrade={deleteTradeToTrash}
            />
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-left text-gray-400">
                  <th className="py-2 pr-2">Символ</th>
                  <th className="py-2 pr-2">Рынок</th>
                  <th className="py-2 pr-2">Напр.</th>
                  <th className="py-2 pr-2">Плечо</th>
                  <th className="py-2 pr-2">Маржа</th>
                  <th className="py-2 pr-2">Вход (ср.)</th>
                  <th className="py-2 pr-2">Выход (ср.)</th>
                  <th className="py-2 pr-2">PnL</th>
                  <th className="py-2 pr-2">ROI</th>
                  <th className="py-2 pr-2">Комис.</th>
                  <th className="py-2 pr-2">Фанд.</th>
                  <th className="py-2 pr-2">Длит.</th>
                  <th className="py-2 pr-2">Стратегия</th>
                  <th className="py-2 pr-2">Эмоция вход</th>
                  <th className="py-2 pr-2">Эмоция выход</th>
                  <th className="py-2 pr-2">Закрыто</th>
                  <th className="py-2 pr-2">Детали</th>
                  <th className="py-2">Действия</th>
                </tr>
              </thead>
              <tbody>
                {groupedTrades.map((g) => (
                  <Fragment key={g.label || "__all__"}>
                    {g.label ? (
                      <tr className="bg-gray-900/60">
                        <td
                          colSpan={7}
                          className="py-2 pl-2 text-xs font-medium uppercase tracking-wide text-gray-500"
                        >
                          {g.label}
                        </td>
                        <td
                          className={`py-2 pr-2 text-xs font-normal normal-case ${
                            g.sumPnl > 0
                              ? "text-green-400"
                              : g.sumPnl < 0
                                ? "text-red-400"
                                : "text-gray-300"
                          }`}
                        >
                          PnL: {formatGroupAggPnl(g.trades, g.sumPnl)}
                        </td>
                        <td
                          className={`py-2 pr-2 text-xs font-normal normal-case ${
                            g.groupRoiPct != null && g.groupRoiPct > 0
                              ? "text-green-400"
                              : g.groupRoiPct != null && g.groupRoiPct < 0
                                ? "text-red-400"
                                : "text-gray-300"
                          }`}
                        >
                          ROI:{" "}
                          {g.groupRoiPct != null ? `${formatPercent(g.groupRoiPct)}%` : "—"}
                        </td>
                        <td colSpan={9} className="py-2" />
                      </tr>
                    ) : null}
                    {g.trades.map((t) => {
                      const q = quoteCurrencyFromSymbol(t.symbol)
                      const j = t.journal
                      const pnl = j.displayPnl ?? 0
                      const roi = j.tradeRoiPct ?? 0

                      return (
                        <Fragment key={t.id}>
                          <tr className="border-b border-gray-900">
                            <td className="py-2 pr-2">{t.symbol}</td>
                            <td className="py-2 pr-2">{t.marketType}</td>
                            <td
                              className={`py-2 pr-2 font-medium ${
                                t.direction === "LONG" ? "text-green-400" : "text-red-400"
                              }`}
                            >
                              {t.direction}
                            </td>
                            <td className="py-2 pr-2">
                              {j.maxLeverage ? `${j.maxLeverage}×` : "—"}
                            </td>
                            <td className="py-2 pr-2">{formatInQuote(j.entryVolume, q)}</td>
                            <td className="py-2 pr-2">
                              {j.avgEntry ? formatDecimal(j.avgEntry) : "—"}
                            </td>
                            <td className="py-2 pr-2">
                              {j.avgExit != null ? formatDecimal(j.avgExit) : "—"}
                            </td>
                            <td
                              className={
                                pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : ""
                              }
                            >
                              {formatInQuote(pnl, q)}
                            </td>
                            <td
                              className={
                                roi > 0 ? "text-green-400" : roi < 0 ? "text-red-400" : ""
                              }
                            >
                              {formatPercent(roi)}%
                            </td>
                            <td className="py-2 pr-2">{formatInQuote(t.fee, q)}</td>
                            <td className="py-2 pr-2">{formatInQuote(t.funding, q)}</td>
                            <td className="py-2 pr-2">{formatDurationMs(j.durationMs)}</td>
                            <td
                              className="max-w-[140px] truncate py-2 pr-2"
                              title={t.strategy ?? ""}
                            >
                              {t.strategy ?? "—"}
                            </td>
                            <td
                              className="max-w-[120px] truncate py-2 pr-2"
                              title={t.emotionEntry ?? ""}
                            >
                              {t.emotionEntry ?? "—"}
                            </td>
                            <td
                              className="max-w-[120px] truncate py-2 pr-2"
                              title={t.emotionExit ?? ""}
                            >
                              {t.emotionExit ?? "—"}
                            </td>
                            <td className="py-2 pr-2">
                              {t.closedAt ? new Date(t.closedAt).toLocaleString() : "—"}
                            </td>
                            <td className="py-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setExpanded((p) => ({ ...p, [t.id]: !(p[t.id] ?? false) }))
                                }
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
                              <td colSpan={TRADES_COL_SPAN} className="py-3">
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
                                          <div
                                            key={e.id}
                                            className="flex flex-wrap justify-between gap-2"
                                          >
                                            <span className="text-gray-400">
                                              {new Date(e.timestamp).toLocaleString()}
                                            </span>
                                            <span>{formatDecimal(e.price)}</span>
                                            <span>{formatInQuote(e.volume, q)}</span>
                                            <span>
                                              fee{" "}
                                              {e.fee != null
                                                ? formatInQuote(Number(e.fee), q)
                                                : "—"}
                                            </span>
                                            <span>{e.liquidityRole}</span>
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                  <div>
                                    <div className="mb-2 text-xs text-gray-400">
                                      Выходы (каждая сделка)
                                    </div>
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
                                              <span>{formatDecimal(x.price)}</span>
                                              <span>{formatInQuote(x.volume, q)}</span>
                                              <span>
                                                fee{" "}
                                                {x.fee != null
                                                  ? formatInQuote(Number(x.fee), q)
                                                  : "—"}
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
                                  strategy: <span className="text-gray-200">{t.strategy ?? "—"}</span>{" "}
                                  · эмоция входа (трейд):{" "}
                                  <span className="text-gray-200">{t.emotionEntry ?? "—"}</span> ·
                                  эмоция выхода (последняя в трейде):{" "}
                                  <span className="text-gray-200">{t.emotionExit ?? "—"}</span> · fee
                                  сумм.:{" "}
                                  <span className="text-gray-200">
                                    {t.fee != null ? formatInQuote(Number(t.fee), q) : "—"}
                                  </span>{" "}
                                  · funding:{" "}
                                  <span className="text-gray-200">
                                    {t.funding != null
                                      ? formatInQuote(Number(t.funding), q)
                                      : "—"}
                                  </span>
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      )
                    })}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
          {trades.length === 0 && (
            <p className="mt-4 text-center text-gray-500">Нет закрытых трейдов по фильтру</p>
          )}
        </>
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
                <th className="py-2 pr-2">Рынок</th>
                <th className="py-2 pr-2">Трейд</th>
                <th className="py-2 pr-2">Напр.</th>
                <th className="py-2 pr-2">Плечо</th>
                <th className="py-2 pr-2">Вход (ср.)</th>
                <th className="py-2 pr-2">Выход</th>
                <th className="py-2 pr-2">Маржа</th>
                <th className="py-2 pr-2">M/T</th>
                <th className="py-2 pr-2">Комиссия</th>
                <th className="py-2 pr-2">Фандинг</th>
                <th className="py-2 pr-2">PnL</th>
                <th className="py-2 pr-2">ROI</th>
                <th className="py-2 pr-2">Стратегия</th>
                <th className="py-2 pr-2">Эмоция вход</th>
                <th className="py-2 pr-2">Эмоция выход</th>
                <th className="py-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {groupedExits.map((g) => (
                <Fragment key={g.label || "__ex_all__"}>
                  {g.label ? (
                    <tr className="bg-gray-900/60">
                      <td
                        colSpan={12}
                        className="py-2 pl-2 text-xs font-medium uppercase tracking-wide text-gray-500"
                      >
                        {g.label}
                      </td>
                      <td
                        className={`py-2 pr-2 text-xs font-normal normal-case ${
                          g.sumPnl > 0
                            ? "text-green-400"
                            : g.sumPnl < 0
                              ? "text-red-400"
                              : "text-gray-300"
                        }`}
                      >
                        PnL: {formatExitGroupAggPnl(g.rows, g.sumPnl)}
                      </td>
                      <td
                        className={`py-2 pr-2 text-xs font-normal normal-case ${
                          g.groupRoiPct != null && g.groupRoiPct > 0
                            ? "text-green-400"
                            : g.groupRoiPct != null && g.groupRoiPct < 0
                              ? "text-red-400"
                              : "text-gray-300"
                        }`}
                      >
                        ROI:{" "}
                        {g.groupRoiPct != null ? `${formatPercent(g.groupRoiPct)}%` : "—"}
                      </td>
                      <td colSpan={4} className="py-2" />
                    </tr>
                  ) : null}
                  {g.rows.map(({ exit: x, trade: t }) => {
                    const q = quoteCurrencyFromSymbol(t.symbol)
                    const pnl = x.legJournal.pnl
                    const roiPct = x.legJournal.roiPct
                    const avgIn = t.journal.avgEntry
                    return (
                      <tr key={x.id} className="border-b border-gray-900">
                        <td className="py-2 pr-2 text-gray-400">
                          {new Date(x.timestamp).toLocaleString()}
                        </td>
                        <td className="py-2 pr-2">{t.symbol}</td>
                        <td className="py-2 pr-2">{t.marketType}</td>
                        <td className="py-2 pr-2 font-mono text-xs text-gray-500">
                          {t.id.slice(0, 8)}…
                        </td>
                        <td
                          className={`py-2 pr-2 font-medium ${
                            t.direction === "LONG" ? "text-green-400" : "text-red-400"
                          }`}
                        >
                          {t.direction}
                        </td>
                        <td className="py-2 pr-2">
                          {t.journal.maxLeverage ? `${t.journal.maxLeverage}×` : "—"}
                        </td>
                        <td className="py-2 pr-2">{avgIn != null ? formatDecimal(avgIn) : "—"}</td>
                        <td className="py-2 pr-2">{formatDecimal(x.price)}</td>
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
                        <td
                          className={
                            roiPct > 0 ? "text-green-400" : roiPct < 0 ? "text-red-400" : ""
                          }
                        >
                          {formatPercent(roiPct)}%
                        </td>
                        <td className="max-w-[140px] truncate py-2 pr-2" title={t.strategy ?? ""}>
                          {t.strategy ?? "—"}
                        </td>
                        <td
                          className="max-w-[120px] truncate py-2 pr-2"
                          title={t.emotionEntry ?? ""}
                        >
                          {t.emotionEntry ?? "—"}
                        </td>
                        <td
                          className="max-w-[120px] truncate py-2 pr-2"
                          title={x.emotionExit ?? ""}
                        >
                          {x.emotionExit ?? "—"}
                        </td>
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
                </Fragment>
              ))}
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
