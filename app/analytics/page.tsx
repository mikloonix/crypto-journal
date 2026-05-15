"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import type { AnalyticsSnapshotDto } from "@/contracts/analytics"
import {
  getAnalytics,
  getJournalStrategyValues,
  getJournalSymbols,
  getTradingDefaults,
} from "@/features/trades/api"
import { useActiveAccount } from "@/features/trades/active-account-context"
import { isValidIanaTimeZone } from "@/lib/iana-time-zone"
import { zonedRollingPeriodInclusiveYmd } from "@/lib/zoned-date-range"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import { redirectOn401 } from "@/features/trades/session-expired"
import { formatDecimal, formatInQuote, formatPercent } from "@/lib/format-amount"
import { ru } from "date-fns/locale"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

const CHART_COLORS = ["#2B7FFF", "#00D395", "#FF4D6D", "#FFB443", "#8E98B3", "#5C6BC0", "#26A69A"]

const PERIOD_PRESETS = [
  { days: 7, label: "7 дн." },
  { days: 30, label: "30 дн." },
  { days: 90, label: "90 дн." },
  { days: 180, label: "180 дн." },
  { days: 365, label: "Год" },
] as const

type MonthCell = { day: number | null; ymd: string | null; pnl: number | null }

function buildMonthCalendarModel(
  snap: AnalyticsSnapshotDto,
  year: number,
  month: number,
): { title: string; cells: MonthCell[] } {
  const tz = snap.timeZone
  const yyyymm = `${year}-${String(month).padStart(2, "0")}`
  const daysInMonth = new Date(year, month, 0).getDate()
  const map = new Map(snap.pnlByDay.map((d) => [d.dayYmd, d.pnlUsdt]))
  const firstYmd = `${yyyymm}-01`
  const firstNoon = fromZonedTime(`${firstYmd}T12:00:00`, tz)
  const isoDow = Number(formatInTimeZone(firstNoon, tz, "i"))
  const leading = (isoDow + 6) % 7
  const cells: MonthCell[] = []
  for (let i = 0; i < leading; i++) cells.push({ day: null, ymd: null, pnl: null })
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, "0")
    const ymd = `${yyyymm}-${dd}`
    cells.push({
      day: d,
      ymd,
      pnl: map.has(ymd) ? map.get(ymd)! : null,
    })
  }
  const title = formatInTimeZone(firstNoon, tz, "LLLL yyyy", { locale: ru })
  return { title, cells }
}

function buildEquityAtDayStartUsdt(snap: AnalyticsSnapshotDto): Map<string, number> {
  const sorted = [...snap.pnlByDay].sort((a, b) => a.dayYmd.localeCompare(b.dayYmd))
  let running = snap.summary.capitalAtPeriodStartUsdt
  const m = new Map<string, number>()
  for (const d of sorted) {
    m.set(d.dayYmd, running)
    running += d.pnlUsdt
  }
  return m
}

function dayCalendarTooltip(ymd: string, pnl: number | null, equityAtStart: Map<string, number>): string {
  if (pnl == null) return `${ymd}: нет сделок`
  const eq0 = equityAtStart.get(ymd)
  const roi = eq0 != null && eq0 > 1e-9 ? (pnl / eq0) * 100 : null
  const pnlPart = `PnL ${formatInQuote(pnl, "USDT")}`
  const roiPart =
    roi != null ? ` · ROI ${formatPercent(roi)}% (от капитала на начало дня в периоде)` : ""
  return `${ymd} · ${pnlPart}${roiPart}`
}

function sumPnlForYyyymm(snap: AnalyticsSnapshotDto, yyyymm: string): number {
  return snap.pnlByDay.filter((d) => d.dayYmd.startsWith(yyyymm)).reduce((s, d) => s + d.pnlUsdt, 0)
}

function addCalendarMonthsYm(ym: string, delta: number): string {
  const y = Number(ym.slice(0, 4))
  const m = Number(ym.slice(5, 7))
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

function MonthHeatmap({
  title,
  cells,
  equityAtDayStart,
  compact,
  titleNetPnl,
}: {
  title: string
  cells: MonthCell[]
  equityAtDayStart: Map<string, number>
  compact?: boolean
  /** Суммарный PnL по дням месяца в снимке — для подсветки заголовка (вкладка «Год»). */
  titleNetPnl?: number | null
}) {
  const gap = compact ? "gap-0.5" : "gap-1"
  const headClass = compact ? "text-[9px]" : "text-[10px]"
  const titleTone =
    titleNetPnl != null && Number.isFinite(titleNetPnl)
      ? titleNetPnl > 0
        ? "text-green-300"
        : titleNetPnl < 0
          ? "text-red-300"
          : "text-[var(--text-secondary)]"
      : "text-[var(--text-primary)]"
  return (
    <div>
      <p
        className={`mb-2 font-medium capitalize ${titleTone} ${compact ? "text-xs" : "text-sm"}`}
      >
        {title}
      </p>
      <div className={`grid grid-cols-7 ${gap} text-center ${headClass} text-[var(--text-secondary)]`}>
        {["пн", "вт", "ср", "чт", "пт", "сб", "вс"].map((w) => (
          <div key={w} className="py-1 font-medium">
            {w}
          </div>
        ))}
        {cells.map((c, i) => {
          if (c.day == null) {
            return <div key={`e-${i}`} className="aspect-square rounded bg-[var(--surface-elevated)]/30" />
          }
          let bg = "bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
          if (c.pnl != null) {
            if (c.pnl > 0) bg = "bg-[#00D395]/25 text-green-300"
            else if (c.pnl < 0) bg = "bg-[#FF4D6D]/25 text-red-300"
            else bg = "bg-[var(--surface-elevated)] text-[var(--text-secondary)]"
          }
          const ymd = c.ymd ?? ""
          return (
            <div
              key={ymd}
              title={dayCalendarTooltip(ymd, c.pnl, equityAtDayStart)}
              className={`flex aspect-square flex-col items-center justify-center rounded text-xs ${bg}`}
            >
              <span className="font-mono font-medium">{c.day}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

type DraftFilters = {
  fromYmd: string
  toYmd: string
  symbol: string
  strategy: string
  marketType: string
}

function card(title: string, value: string, hint?: string) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-xs text-[var(--text-secondary)]">{title}</p>
      <p className="mt-1 font-mono text-lg font-semibold text-[var(--text-primary)]">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-[var(--text-secondary)]">{hint}</p> : null}
    </div>
  )
}

function chartTooltipStyle() {
  return {
    backgroundColor: "var(--surface-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    color: "var(--text-primary)",
  }
}

export default function AnalyticsPage() {
  const router = useRouter()
  const gate = useProtectedPageSession()
  const authed = gate === "authed"
  const { ready: accountReady, journalAllAccounts, resolvedActiveAccountId } = useActiveAccount()
  const journalScopeKey = `${journalAllAccounts ? "all" : "acct"}:${resolvedActiveAccountId ?? ""}`
  const [mainTab, setMainTab] = useState<"detailed" | "charts">("detailed")
  const [chartTab, setChartTab] = useState<
    | "equity"
    | "pnlDay"
    | "strategy"
    | "symbol"
    | "weekday"
    | "hour"
    | "order"
    | "winloss"
    | "month"
    | "year"
  >("equity")
  const [snap, setSnap] = useState<AnalyticsSnapshotDto | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [draft, setDraft] = useState<DraftFilters>({
    fromYmd: "",
    toYmd: "",
    symbol: "",
    strategy: "",
    marketType: "",
  })
  const [query, setQuery] = useState<Record<string, string>>({})
  const seededDates = useRef(false)
  const [symbolPick, setSymbolPick] = useState<Record<string, boolean>>({})
  const [strategyPick, setStrategyPick] = useState<Record<string, boolean>>({})
  const [symbolSearch, setSymbolSearch] = useState("")
  const [strategySearch, setStrategySearch] = useState("")
  const [appTimeZone, setAppTimeZone] = useState("UTC")
  const [journalSymbols, setJournalSymbols] = useState<string[]>([])
  const [journalStrategies, setJournalStrategies] = useState<string[]>([])
  const [calendarMonthYm, setCalendarMonthYm] = useState<string | null>(null)
  const [calendarYearY, setCalendarYearY] = useState<number | null>(null)
  const calendarPeriodKeyRef = useRef<string>("")
  const draftRef = useRef(draft)
  draftRef.current = draft

  useEffect(() => {
    if (!authed || !accountReady) return
    void getJournalSymbols({ status: "CLOSED" }).then((r) => {
      if (r.ok) setJournalSymbols(r.data.symbols ?? [])
    })
    void getJournalStrategyValues({ status: "CLOSED" }).then((r) => {
      if (r.ok) setJournalStrategies(r.data.strategies ?? [])
    })
  }, [authed, accountReady])

  useEffect(() => {
    if (!authed) return
    void getTradingDefaults().then((r) => {
      if (!r.ok) return
      const tz = (r.data.displayTimeZone && String(r.data.displayTimeZone).trim()) || "UTC"
      setAppTimeZone(isValidIanaTimeZone(tz) ? tz : "UTC")
    })
  }, [authed])

  const load = useCallback(async () => {
    if (!authed || !accountReady) return
    void journalScopeKey
    setLoadErr(null)
    const r = await getAnalytics(query)
    if (!r.ok) {
      redirectOn401(router, r.status)
      setSnap(null)
      setLoadErr(r.error ?? "Ошибка загрузки")
      return
    }
    setSnap(r.data)
    if (!seededDates.current && Object.keys(query).length === 0) {
      seededDates.current = true
      setDraft((d) => ({
        ...d,
        fromYmd: r.data.fromYmd,
        toYmd: r.data.toYmd,
      }))
    }
    const pick: Record<string, boolean> = {}
    for (const s of r.data.symbolSlices) pick[s.symbol] = true
    setSymbolPick(pick)
    const sp: Record<string, boolean> = {}
    for (const s of r.data.strategySlices) sp[s.strategy] = true
    setStrategyPick(sp)
  }, [authed, accountReady, journalScopeKey, query, router])

  useEffect(() => {
    void load()
  }, [load])

  const calendarPeriodKey = snap ? `${snap.fromYmd}_${snap.toYmd}` : ""
  useEffect(() => {
    if (!snap) return
    if (calendarPeriodKeyRef.current === calendarPeriodKey) return
    calendarPeriodKeyRef.current = calendarPeriodKey
    setCalendarMonthYm(snap.toYmd.slice(0, 7))
    setCalendarYearY(Number(snap.toYmd.slice(0, 4)))
  }, [calendarPeriodKey, snap])

  function applyFilters() {
    seededDates.current = true
    const q: Record<string, string> = {}
    if (draft.fromYmd.trim()) q.fromYmd = draft.fromYmd.trim()
    if (draft.toYmd.trim()) q.toYmd = draft.toYmd.trim()
    if (draft.symbol.trim()) q.symbol = draft.symbol.trim()
    if (draft.strategy.trim()) q.strategy = draft.strategy.trim()
    if (draft.marketType.trim()) q.marketType = draft.marketType.trim()
    setQuery(q)
  }

  function resetFilters() {
    seededDates.current = false
    setDraft({
      fromYmd: "",
      toYmd: "",
      symbol: "",
      strategy: "",
      marketType: "",
    })
    setQuery({})
  }

  function applyPeriodPreset(dayCount: number) {
    const tz = isValidIanaTimeZone(appTimeZone) ? appTimeZone : "UTC"
    const { fromYmd, toYmd } = zonedRollingPeriodInclusiveYmd(tz, dayCount)
    seededDates.current = true
    const d = draftRef.current
    const nextDraft: DraftFilters = { ...d, fromYmd, toYmd }
    setDraft(nextDraft)
    const q: Record<string, string> = { fromYmd, toYmd }
    if (nextDraft.symbol.trim()) q.symbol = nextDraft.symbol.trim()
    if (nextDraft.strategy.trim()) q.strategy = nextDraft.strategy.trim()
    if (nextDraft.marketType.trim()) q.marketType = nextDraft.marketType.trim()
    setQuery(q)
  }

  async function downloadCsv() {
    const qs = new URLSearchParams()
    for (const [k, v] of Object.entries(query)) {
      if (v) qs.set(k, v)
    }
    qs.set("format", "csv")
    const res = await fetch(`/api/analytics?${qs}`, { credentials: "include" })
    if (res.status === 401) {
      redirectOn401(router, 401)
      return
    }
    if (!res.ok) {
      setLoadErr("Не удалось выгрузить CSV")
      return
    }
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `analytics-${snap?.fromYmd ?? "export"}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const symbolChartData = useMemo(() => {
    if (!snap) return []
    return snap.symbolSlices
      .filter((s) => symbolPick[s.symbol] !== false)
      .map((s) => ({ name: s.symbol, value: s.pnlUsdt, count: s.count }))
  }, [snap, symbolPick])

  const strategyChartData = useMemo(() => {
    if (!snap) return []
    return snap.strategySlices.filter((x) => strategyPick[x.strategy] !== false)
  }, [snap, strategyPick])

  const monthYmEff = calendarMonthYm ?? snap?.toYmd.slice(0, 7) ?? ""
  const yearEff = calendarYearY ?? (snap ? Number(snap.toYmd.slice(0, 4)) : new Date().getFullYear())

  const monthCalendar = useMemo(() => {
    if (!snap || !monthYmEff) return null
    const y = Number(monthYmEff.slice(0, 4))
    const m = Number(monthYmEff.slice(5, 7))
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) return null
    return buildMonthCalendarModel(snap, y, m)
  }, [snap, monthYmEff])

  const yearCalendars = useMemo(() => {
    if (!snap) return []
    const Y = yearEff
    return Array.from({ length: 12 }, (_, i) => buildMonthCalendarModel(snap, Y, i + 1))
  }, [snap, yearEff])

  const equityAtDayStart = useMemo(() => {
    if (!snap) return new Map<string, number>()
    return buildEquityAtDayStartUsdt(snap)
  }, [snap])

  const filteredSymbolRows = useMemo(() => {
    if (!snap) return []
    const q = symbolSearch.trim().toLowerCase()
    return snap.symbolSlices.filter((x) => (q ? x.symbol.toLowerCase().includes(q) : true))
  }, [snap, symbolSearch])

  const filteredStrategyRows = useMemo(() => {
    if (!snap) return []
    const q = strategySearch.trim().toLowerCase()
    return snap.strategySlices.filter((x) => (q ? x.strategy.toLowerCase().includes(q) : true))
  }, [snap, strategySearch])

  function symbolColorIndex(symbol: string): number {
    if (!snap) return 0
    const i = snap.symbolSlices.findIndex((s) => s.symbol === symbol)
    return i < 0 ? 0 : i % CHART_COLORS.length
  }

  function strategyColorIndex(strategy: string): number {
    if (!snap) return 0
    const i = snap.strategySlices.findIndex((s) => s.strategy === strategy)
    return i < 0 ? 0 : i % CHART_COLORS.length
  }

  const equityData = useMemo(() => {
    if (!snap) return []
    const tz = snap.timeZone
    return snap.equityCurve.map((p) => ({
      ...p,
      label: formatInTimeZone(new Date(p.closedAt), tz, "dd.MM HH:mm"),
    }))
  }, [snap])

  const pnlDayData = useMemo(() => {
    if (!snap) return []
    return snap.pnlByDay.map((d) => ({ ...d, label: d.dayYmd.slice(5) }))
  }, [snap])

  if (gate === "loading") {
    return <div className="text-[var(--text-secondary)]">Загрузка…</div>
  }
  if (gate === "guest") {
    return null
  }

  const s = snap?.summary

  return (
    <div className="text-[var(--text-primary)]">
      <div className="mb-4">
        <h1 className="text-2xl font-semibold">Аналитика</h1>
      </div>

      <section className="mb-4 space-y-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <datalist id="analytics-dl-symbols">
          {journalSymbols.map((sym) => (
            <option key={sym} value={sym} />
          ))}
        </datalist>
        <datalist id="analytics-dl-strategies">
          {journalStrategies.map((st) => (
            <option key={st} value={st} />
          ))}
        </datalist>
        <div className="flex flex-wrap gap-2">
          <div>
            <label className="text-xs text-[var(--text-secondary)]">От (YYYY-MM-DD)</label>
            <input
              type="date"
              value={draft.fromYmd}
              onChange={(e) => setDraft((d) => ({ ...d, fromYmd: e.target.value }))}
              className="mt-1 block rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)]">До</label>
            <input
              type="date"
              value={draft.toYmd}
              onChange={(e) => setDraft((d) => ({ ...d, toYmd: e.target.value }))}
              className="mt-1 block rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Символ (частично)</label>
            <input
              value={draft.symbol}
              onChange={(e) => setDraft((d) => ({ ...d, symbol: e.target.value }))}
              placeholder="BTCUSDT"
              list="analytics-dl-symbols"
              autoComplete="off"
              className="mt-1 block w-36 rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Стратегия</label>
            <input
              value={draft.strategy}
              onChange={(e) => setDraft((d) => ({ ...d, strategy: e.target.value }))}
              list="analytics-dl-strategies"
              autoComplete="off"
              className="mt-1 block w-36 rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-xs text-[var(--text-secondary)]">Рынок</label>
            <select
              value={draft.marketType}
              onChange={(e) => setDraft((d) => ({ ...d, marketType: e.target.value }))}
              className="mt-1 block rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm"
            >
              <option value="">Все</option>
              <option value="SPOT">SPOT</option>
              <option value="FUTURE">FUTURE</option>
            </select>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--text-secondary)]">Период:</span>
          {PERIOD_PRESETS.map(({ days, label }) => (
            <button
              key={days}
              type="button"
              onClick={() => applyPeriodPreset(days)}
              className="rounded border border-[var(--border)] px-2.5 py-1 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => applyFilters()}
            className="rounded bg-[var(--accent-blue)] px-4 py-2 text-sm text-white hover:opacity-90"
          >
            Применить
          </button>
          <button
            type="button"
            onClick={() => resetFilters()}
            className="rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
          >
            Сброс
          </button>
          <button
            type="button"
            onClick={() => void downloadCsv()}
            disabled={!snap}
            className="rounded border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-primary)] hover:bg-[var(--surface-elevated)] disabled:opacity-50"
          >
            CSV
          </button>
        </div>
        {loadErr ? <p className="text-sm text-[var(--accent-red)]">{loadErr}</p> : null}
      </section>

      <div className="mb-4 flex flex-wrap gap-2 border-b border-[var(--border)] pb-2">
        {(
          [
            ["detailed", "Detailed Stats"],
            ["charts", "Analytics"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setMainTab(id)}
            className={`rounded px-3 py-1.5 text-sm ${
              mainTab === id
                ? "bg-[var(--accent-blue)] text-white"
                : "border border-[var(--border)] text-[var(--text-secondary)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {!snap || !s ? (
        <p className="text-[var(--text-secondary)]">Нет данных</p>
      ) : mainTab === "detailed" ? (
        <div className="space-y-6">
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <h3 className="mb-2 text-sm text-[var(--text-secondary)]">Equity (кумулятивный PnL)</h3>
              <p className="mb-1 text-[10px] text-[var(--text-secondary)]">Ось времени: {snap.timeZone}</p>
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle()} />
                    <Line type="monotone" dataKey="cumulativePnlUsdt" stroke="#2B7FFF" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
              <h3 className="mb-2 text-sm text-[var(--text-secondary)]">PnL по дням</h3>
              <p className="mb-1 text-[10px] text-[var(--text-secondary)]">Ось времени: {snap.timeZone}</p>
              <div className="h-[260px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pnlDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle()} />
                    <Bar dataKey="pnlUsdt" name="PnL">
                      {pnlDayData.map((e) => (
                        <Cell key={e.dayYmd} fill={e.pnlUsdt >= 0 ? "#00D395" : "#FF4D6D"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {card("PnL", formatInQuote(s.totalPnlUsdt, "USDT"))}
            {card(
              "PnL %",
              s.pnlPercentPeriod != null ? `${formatPercent(s.pnlPercentPeriod)}%` : "—",
              s.pnlPercentPeriod == null ? "Капитал на начало периода ≤ 0" : undefined,
            )}
            {card("Winrate", s.winratePercent != null ? `${formatPercent(s.winratePercent)}%` : "—")}
            {card("Сделок", String(s.closedCount))}
            {card("Avg win", s.avgWinUsdt != null ? formatInQuote(s.avgWinUsdt, "USDT") : "—")}
            {card("Avg loss", s.avgLossUsdt != null ? formatInQuote(s.avgLossUsdt, "USDT") : "—")}
            {card("Profit factor", s.profitFactor != null ? formatDecimal(s.profitFactor) : "—")}
            {card("Risk/Reward", s.riskReward != null ? formatDecimal(s.riskReward) : "—")}
            {card("Gross profit", formatInQuote(s.grossProfitUsdt, "USDT"))}
            {card("Gross loss", formatInQuote(s.grossLossUsdt, "USDT"))}
            {card("Best", s.bestTradePnlUsdt != null ? formatInQuote(s.bestTradePnlUsdt, "USDT") : "—")}
            {card("Worst", s.worstTradePnlUsdt != null ? formatInQuote(s.worstTradePnlUsdt, "USDT") : "—")}
            {card("Стартовый депозит", formatInQuote(s.capitalAtPeriodStartUsdt, "USDT"))}
          </div>

          <div>
            <h2 className="mb-2 text-sm font-medium text-[var(--text-secondary)]">Расширенные</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {card("Sharpe (дн.)", s.sharpeRatio != null ? formatDecimal(s.sharpeRatio) : "—")}
              {card("Max DD USDT", formatDecimal(s.maxDrawdownUsdt))}
              {card(
                "Max DD %",
                s.maxDrawdownPercent != null ? `${formatPercent(s.maxDrawdownPercent)}%` : "—",
              )}
              {card("Expectancy", s.expectancyUsdt != null ? formatInQuote(s.expectancyUsdt, "USDT") : "—")}
              {card("Recovery", s.recoveryFactor != null ? formatDecimal(s.recoveryFactor) : "—")}
              {card(
                "Ср. удержание",
                s.avgHoldingMs != null ? `${formatDecimal(s.avgHoldingMs / 3600000)} ч` : "—",
              )}
              {card("Max ROI сделки", s.maxTradeRoiPercent != null ? `${formatPercent(s.maxTradeRoiPercent)}%` : "—")}
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {(
              [
                ["equity", "Equity"],
                ["pnlDay", "PnL time"],
                ["strategy", "Стратегии"],
                ["symbol", "Symbol"],
                ["weekday", "Weekday"],
                ["hour", "Hours"],
                ["order", "Order type"],
                ["winloss", "Win/Loss"],
                ["month", "Месяц"],
                ["year", "Год"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setChartTab(id)}
                className={`rounded px-2.5 py-1 text-xs ${
                  chartTab === id
                    ? "bg-[var(--surface-elevated)] text-[var(--accent-blue)]"
                    : "text-[var(--text-secondary)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            {chartTab === "equity" ? (
              <div>
                <p className="mb-1 text-[10px] text-[var(--text-secondary)]">Ось времени: {snap.timeZone}</p>
                <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={equityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle()} />
                    <Legend />
                    <Line type="monotone" dataKey="balanceUsdt" name="Баланс" stroke="#00D395" dot={false} />
                    <Line type="monotone" dataKey="cumulativePnlUsdt" name="Кум. PnL" stroke="#2B7FFF" dot={false} />
                  </LineChart>
                </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            {chartTab === "pnlDay" ? (
              <div>
                <p className="mb-1 text-[10px] text-[var(--text-secondary)]">Ось времени: {snap.timeZone}</p>
                <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={pnlDayData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle()} />
                    <Bar dataKey="pnlUsdt" name="PnL">
                      {pnlDayData.map((e) => (
                        <Cell key={e.dayYmd} fill={e.pnlUsdt >= 0 ? "#00D395" : "#FF4D6D"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                </div>
              </div>
            ) : null}

            {chartTab === "strategy" ? (
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="h-[320px] min-w-0 flex-1">
                  {strategyChartData.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">Выберите стратегии справа</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={strategyChartData} layout="vertical" margin={{ left: 16, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis type="number" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                        <YAxis
                          type="category"
                          dataKey="strategy"
                          width={120}
                          tick={{ fill: "var(--text-secondary)", fontSize: 10 }}
                        />
                        <Tooltip contentStyle={chartTooltipStyle()} />
                        <Bar dataKey="pnlUsdt" name="PnL">
                          {strategyChartData.map((e) => (
                            <Cell
                              key={e.strategy}
                              fill={CHART_COLORS[strategyColorIndex(e.strategy) % CHART_COLORS.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="lg:w-64 shrink-0">
                  <p className="mb-2 text-xs text-[var(--text-secondary)]">Стратегии на графике</p>
                  <input
                    type="search"
                    value={strategySearch}
                    onChange={(e) => setStrategySearch(e.target.value)}
                    placeholder="Поиск…"
                    className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                  />
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-[var(--border)] p-2">
                    {filteredStrategyRows.length === 0 ? (
                      <p className="text-xs text-[var(--text-secondary)]">Нет совпадений</p>
                    ) : null}
                    {filteredStrategyRows.map((x) => (
                      <label key={x.strategy} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={strategyPick[x.strategy] !== false}
                          onChange={(e) =>
                            setStrategyPick((p) => ({ ...p, [x.strategy]: e.target.checked }))
                          }
                        />
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{
                            backgroundColor:
                              CHART_COLORS[strategyColorIndex(x.strategy) % CHART_COLORS.length],
                          }}
                        />
                        <span className="truncate">{x.strategy}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs text-[var(--accent-blue)] hover:underline"
                      onClick={() => {
                        const next: Record<string, boolean> = {}
                        for (const x of snap.strategySlices) next[x.strategy] = true
                        setStrategyPick(next)
                      }}
                    >
                      Выбрать всё
                    </button>
                    <button
                      type="button"
                      className="text-xs text-[var(--accent-blue)] hover:underline"
                      onClick={() => {
                        const next: Record<string, boolean> = {}
                        for (const x of snap.strategySlices) next[x.strategy] = false
                        setStrategyPick(next)
                      }}
                    >
                      Сбросить всё
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {chartTab === "symbol" ? (
              <div className="flex flex-col gap-3 lg:flex-row">
                <div className="h-[300px] min-w-0 flex-1">
                  {symbolChartData.length === 0 ? (
                    <p className="text-sm text-[var(--text-secondary)]">Выберите символы справа</p>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={symbolChartData}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={48}
                          outerRadius={100}
                          paddingAngle={2}
                        >
                          {symbolChartData.map((row) => (
                            <Cell
                              key={row.name}
                              fill={CHART_COLORS[symbolColorIndex(row.name) % CHART_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={chartTooltipStyle()} formatter={(v: number) => formatInQuote(v, "USDT")} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
                <div className="lg:w-64 shrink-0">
                  <p className="mb-2 text-xs text-[var(--text-secondary)]">Символы на графике</p>
                  <input
                    type="search"
                    value={symbolSearch}
                    onChange={(e) => setSymbolSearch(e.target.value)}
                    placeholder="Поиск…"
                    className="mb-2 w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-xs text-[var(--text-primary)]"
                  />
                  <div className="max-h-48 space-y-1 overflow-y-auto rounded border border-[var(--border)] p-2">
                    {filteredSymbolRows.length === 0 ? (
                      <p className="text-xs text-[var(--text-secondary)]">Нет совпадений</p>
                    ) : null}
                    {filteredSymbolRows.map((x) => (
                      <label key={x.symbol} className="flex cursor-pointer items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={symbolPick[x.symbol] !== false}
                          onChange={(e) =>
                            setSymbolPick((p) => ({ ...p, [x.symbol]: e.target.checked }))
                          }
                        />
                        <span
                          className="h-2 w-2 shrink-0 rounded-sm"
                          style={{
                            backgroundColor:
                              CHART_COLORS[symbolColorIndex(x.symbol) % CHART_COLORS.length],
                          }}
                        />
                        <span className="font-mono">{x.symbol}</span>
                      </label>
                    ))}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="text-xs text-[var(--accent-blue)] hover:underline"
                      onClick={() => {
                        const next: Record<string, boolean> = {}
                        for (const x of snap.symbolSlices) next[x.symbol] = true
                        setSymbolPick(next)
                      }}
                    >
                      Выбрать всё
                    </button>
                    <button
                      type="button"
                      className="text-xs text-[var(--accent-blue)] hover:underline"
                      onClick={() => {
                        const next: Record<string, boolean> = {}
                        for (const x of snap.symbolSlices) next[x.symbol] = false
                        setSymbolPick(next)
                      }}
                    >
                      Сбросить всё
                    </button>
                  </div>
                </div>
              </div>
            ) : null}

            {chartTab === "weekday" ? (
              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={snap.weekdaySlices}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle()} />
                    <Bar dataKey="pnlUsdt" name="PnL">
                      {snap.weekdaySlices.map((e) => (
                        <Cell key={e.weekday} fill={e.pnlUsdt >= 0 ? "#00D395" : "#FF4D6D"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {chartTab === "hour" ? (
              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={snap.hourSlices}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="hour" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle()} />
                    <Bar dataKey="pnlUsdt" name="PnL">
                      {snap.hourSlices.map((e) => (
                        <Cell key={e.hour} fill={e.pnlUsdt >= 0 ? "#00D395" : "#FF4D6D"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {chartTab === "order" ? (
              <div className="h-[320px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={snap.marketDirectionSlices.map((m) => ({
                      ...m,
                      label: `${m.marketType} ${m.direction}`,
                    }))}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="label" tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <YAxis tick={{ fill: "var(--text-secondary)", fontSize: 10 }} />
                    <Tooltip contentStyle={chartTooltipStyle()} />
                    <Bar dataKey="pnlUsdt" fill="#2B7FFF" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {chartTab === "winloss" ? (
              <div className="h-[300px] w-full min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={[
                        { name: "Win", value: snap.winLoss.winTrades },
                        { name: "Loss", value: snap.winLoss.lossTrades },
                      ]}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                    >
                      <Cell fill="#00D395" />
                      <Cell fill="#FF4D6D" />
                    </Pie>
                    <Tooltip contentStyle={chartTooltipStyle()} />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            ) : null}

            {chartTab === "month" && snap ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2">
                  <span className="text-xs text-[var(--text-secondary)]">Месяц</span>
                  <input
                    type="month"
                    value={monthYmEff}
                    onChange={(e) => {
                      const v = e.target.value
                      if (v) setCalendarMonthYm(v)
                    }}
                    className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-xs text-[var(--text-primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setCalendarMonthYm(addCalendarMonthsYm(monthYmEff, -1))}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setCalendarMonthYm(addCalendarMonthsYm(monthYmEff, 1))}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
                  >
                    ›
                  </button>
                </div>
                {monthCalendar ? (
                  <MonthHeatmap
                    title={monthCalendar.title}
                    cells={monthCalendar.cells}
                    equityAtDayStart={equityAtDayStart}
                    titleNetPnl={sumPnlForYyyymm(snap, monthYmEff)}
                  />
                ) : null}
              </>
            ) : null}

            {chartTab === "year" && snap && yearCalendars.length ? (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2 border-b border-[var(--border)] pb-2">
                  <span className="text-xs text-[var(--text-secondary)]">Год</span>
                  <button
                    type="button"
                    onClick={() => setCalendarYearY(yearEff - 1)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
                  >
                    ‹
                  </button>
                  <span className="text-sm font-medium tabular-nums text-[var(--text-primary)]">{yearEff}</span>
                  <button
                    type="button"
                    onClick={() => setCalendarYearY(yearEff + 1)}
                    className="rounded border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--text-primary)] hover:bg-[var(--surface-elevated)]"
                  >
                    ›
                  </button>
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {yearCalendars.map((mc, idx) => {
                    const yyyymm = `${yearEff}-${String(idx + 1).padStart(2, "0")}`
                    return (
                      <MonthHeatmap
                        key={yyyymm}
                        title={mc.title}
                        cells={mc.cells}
                        equityAtDayStart={equityAtDayStart}
                        titleNetPnl={sumPnlForYyyymm(snap, yyyymm)}
                        compact
                      />
                    )
                  })}
                </div>
              </>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}
