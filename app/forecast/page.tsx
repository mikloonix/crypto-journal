"use client"

import { useCallback, useEffect, useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"
import type {
  ForecastProgressDto,
  ForecastSnapshotDto,
  ForecastTableRowDto,
} from "@/contracts/forecast"
import { getForecast } from "@/features/forecast/api"
import {
  getRiskSettings,
  patchRiskSettings,
  postRiskSyncBalance,
} from "@/features/risk/api"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import { redirectOn401 } from "@/features/trades/session-expired"
import {
  formatDisplayPercent,
  formatInQuote,
  formatInQuoteDisplay,
} from "@/lib/format-amount"

function rowBg(row: ForecastTableRowDto): string {
  switch (row.highlight) {
    case "profit":
      return "bg-green-950/45"
    case "loss":
      return "bg-red-950/45"
    case "goal_deposit":
      return "bg-amber-500/25"
    case "goal_day":
      return "bg-amber-950/55"
    default:
      return ""
  }
}

function formatStepsPerDay(n: number): string {
  if (Math.abs(n - Math.round(n)) < 1e-6) return String(Math.round(n))
  return n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function planAchievementLabel(
  progress: ForecastProgressDto | null | undefined,
  earlyByCalendarDays: number | null | undefined,
): string {
  const ahead =
    earlyByCalendarDays ??
    (progress?.aheadCalendarDaysVsDeadline != null && progress.aheadCalendarDaysVsDeadline > 0
      ? progress.aheadCalendarDaysVsDeadline
      : null)
  if (ahead != null && ahead > 0) {
    return `Цель депозита достижима в симуляции (опережение на ${ahead} дн.)`
  }
  return "Цель депозита достижима в симуляции"
}

function highlightTextClass(h: ForecastTableRowDto["highlight"]): string {
  switch (h) {
    case "profit":
      return "text-green-300"
    case "loss":
      return "text-red-300"
    case "goal_deposit":
      return "text-amber-200"
    case "goal_day":
      return "text-amber-400/90"
    default:
      return "text-[var(--text-primary)]"
  }
}

export default function ForecastPage() {
  const router = useRouter()
  const gate = useProtectedPageSession()
  const authed = gate === "authed"

  const [mode, setMode] = useState<"plan" | "online">("online")
  const [goalsByMode, setGoalsByMode] = useState({ online: "", plan: "" })
  const [roiByMode, setRoiByMode] = useState({ online: "", plan: "" })
  const [deadline, setDeadline] = useState("")
  const [planDepositInput, setPlanDepositInput] = useState("")
  const [onlineStartDate, setOnlineStartDate] = useState("")
  const [onlineStartDeposit, setOnlineStartDeposit] = useState("")
  const [hideActualRows, setHideActualRows] = useState(false)

  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [formErr, setFormErr] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [portfolioEstimate, setPortfolioEstimate] = useState<number | null>(null)
  const [snapshot, setSnapshot] = useState<ForecastSnapshotDto | null>(null)
  const [settingsNonce, setSettingsNonce] = useState(0)
  const [snapshotNonce, setSnapshotNonce] = useState(0)

  const reloadSnapshotOnly = useCallback(() => {
    setSnapshotNonce((n) => n + 1)
  }, [])

  const reloadAllFromServer = useCallback(() => {
    setSettingsNonce((n) => n + 1)
    setSnapshotNonce((n) => n + 1)
  }, [])

  const loadSettingsIntoForm = useCallback(async () => {
    const r = await getRiskSettings()
    if (!r.ok) {
      redirectOn401(router, r.status)
      setFormErr(r.error ?? "Не удалось загрузить настройки")
      return
    }
    const s = r.data.settings
    setGoalsByMode({
      online:
        s.forecastDepositTargetUsdt != null ? String(s.forecastDepositTargetUsdt) : "",
      plan:
        s.forecastPlanDepositTargetUsdt != null ? String(s.forecastPlanDepositTargetUsdt) : "",
    })
    setRoiByMode({
      online:
        s.forecastTradeRoiPercent != null ? String(s.forecastTradeRoiPercent) : "",
      plan:
        s.forecastPlanTradeRoiPercent != null
          ? String(s.forecastPlanTradeRoiPercent)
          : s.forecastTradeRoiPercent != null
            ? String(s.forecastTradeRoiPercent)
            : "",
    })
    setDeadline(s.forecastDeadlineYmd ?? "")
    setOnlineStartDate(s.forecastStartedAtYmd ?? "")
    setOnlineStartDeposit(
      s.forecastStartEquityUsdt != null ? String(s.forecastStartEquityUsdt) : "",
    )
    setPortfolioEstimate(r.data.portfolio.balanceEstimateUsdt)
    setFormErr(null)
  }, [router])

  useEffect(() => {
    if (!authed) return
    void loadSettingsIntoForm()
  }, [authed, loadSettingsIntoForm, settingsNonce])

  const fetchSnapshotOnly = useCallback(async () => {
    setLoadErr(null)
    const pd = Number(planDepositInput.trim())
    const planDepositOpt =
      mode === "plan" && Number.isFinite(pd) && pd > 0 ? pd : undefined
    const r = await getForecast({ mode, planDeposit: planDepositOpt })
    if (!r.ok) {
      redirectOn401(router, r.status)
      setSnapshot(null)
      setLoadErr(r.error ?? "Ошибка загрузки таблицы")
      return
    }
    setSnapshot(r.data)
  }, [mode, planDepositInput, router])

  useEffect(() => {
    if (!authed) return
    void fetchSnapshotOnly()
  }, [authed, fetchSnapshotOnly, snapshotNonce])

  async function saveForecastSettings(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setFormErr(null)
    const g = goalsByMode[mode].trim()
    const r = roiByMode[mode].trim()
    const d = deadline.trim()
    const body: Record<string, unknown> = {}

    let parsedGoal: number | null = null
    if (g !== "") {
      const n = Number(g)
      if (!(Number.isFinite(n) && n > 0)) {
        setFormErr("Цель по депозиту — положительное число USDT или пусто")
        setSaving(false)
        return
      }
      parsedGoal = n
    }
    if (mode === "plan") body.forecastPlanDepositTargetUsdt = parsedGoal
    else body.forecastDepositTargetUsdt = parsedGoal

    if (r === "") {
      if (mode === "plan") body.forecastPlanTradeRoiPercent = null
      else body.forecastTradeRoiPercent = null
    } else {
      const n = Number(r)
      if (!(Number.isFinite(n) && n >= 0.5 && n <= 100)) {
        setFormErr("ROI на сделку: 0,5…100 % или пусто (сброс)")
        setSaving(false)
        return
      }
      if (mode === "plan") body.forecastPlanTradeRoiPercent = n
      else body.forecastTradeRoiPercent = n
    }

    if (d === "") body.forecastDeadlineYmd = null
    else {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        setFormErr("Дедлайн: формат yyyy-MM-dd")
        setSaving(false)
        return
      }
      body.forecastDeadlineYmd = d
    }

    if (mode === "online") {
      const sd = onlineStartDate.trim()
      const dep = onlineStartDeposit.trim()
      if (sd === "") {
        body.forecastStartedAtYmd = null
        body.forecastStartEquityUsdt = null
      } else {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(sd)) {
          setFormErr("Старт прогноза: формат yyyy-MM-dd")
          setSaving(false)
          return
        }
        body.forecastStartedAtYmd = sd
        if (dep === "") body.forecastStartEquityUsdt = null
        else {
          const n = Number(dep)
          if (!(Number.isFinite(n) && n > 0)) {
            setFormErr("Депозит на старт — положительное число или пусто")
            setSaving(false)
            return
          }
          body.forecastStartEquityUsdt = n
        }
      }
    }

    const res = await patchRiskSettings(body)
    if (!res.ok) {
      setFormErr(res.error ?? "Ошибка сохранения")
      setSaving(false)
      return
    }
    const s = res.data
    setGoalsByMode({
      online:
        s.forecastDepositTargetUsdt != null ? String(s.forecastDepositTargetUsdt) : "",
      plan:
        s.forecastPlanDepositTargetUsdt != null ? String(s.forecastPlanDepositTargetUsdt) : "",
    })
    setRoiByMode({
      online:
        s.forecastTradeRoiPercent != null ? String(s.forecastTradeRoiPercent) : "",
      plan:
        s.forecastPlanTradeRoiPercent != null
          ? String(s.forecastPlanTradeRoiPercent)
          : "",
    })
    setDeadline(s.forecastDeadlineYmd ?? "")
    setOnlineStartDate(s.forecastStartedAtYmd ?? "")
    setOnlineStartDeposit(
      s.forecastStartEquityUsdt != null ? String(s.forecastStartEquityUsdt) : "",
    )
    reloadAllFromServer()
    setSaving(false)
  }

  async function onSyncBalance() {
    setFormErr(null)
    const r = await postRiskSyncBalance()
    if (!r.ok) {
      setFormErr(r.error ?? "Не удалось синхронизировать")
      return
    }
    setPortfolioEstimate(r.data.syncedBalanceUsdt)
    reloadAllFromServer()
  }

  if (gate === "loading") {
    return <div className="text-[var(--text-secondary)]">Загрузка…</div>
  }
  if (gate === "guest") return null

  const ach = snapshot?.achievement
  const progress = snapshot?.progress
  const roi = roiByMode[mode]
  const roiSliderVal = (() => {
    const n = Number(roi)
    if (!Number.isFinite(n)) return 5
    return Math.min(100, Math.max(0.5, n))
  })()

  const visibleRows =
    snapshot?.rows && hideActualRows ? snapshot.rows.filter((r) => r.planned) : snapshot?.rows ?? []

  return (
    <div className="text-[var(--text-primary)]">
      <h1 className="mb-6 text-2xl font-semibold">Прогноз по депозиту</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={`rounded px-3 py-1.5 text-sm ${
            mode === "online"
              ? "bg-[var(--accent-blue)] text-white"
              : "border border-[var(--border)] text-[var(--text-secondary)]"
          }`}
          onClick={() => setMode("online")}
        >
          Онлайн
        </button>
        <button
          type="button"
          className={`rounded px-3 py-1.5 text-sm ${
            mode === "plan"
              ? "bg-[var(--accent-blue)] text-white"
              : "border border-[var(--border)] text-[var(--text-secondary)]"
          }`}
          onClick={() => setMode("plan")}
        >
          План
        </button>
      </div>

      <form
        onSubmit={saveForecastSettings}
        className="mb-8 grid max-w-3xl grid-cols-1 gap-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4 md:grid-cols-2"
      >
        <label className="flex flex-col gap-1 text-sm md:col-span-2">
          <span className="text-[var(--text-secondary)]">Цель по депозиту (USDT)</span>
          <input
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 tabular-nums"
            value={goalsByMode[mode]}
            onChange={(e) =>
              setGoalsByMode((prev) => ({ ...prev, [mode]: e.target.value }))
            }
            placeholder="Не задано"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm md:col-span-2">
          <span className="text-[var(--text-secondary)]">
            ROI на сделку: {formatDisplayPercent(roiSliderVal)}%
          </span>
          <input
            type="range"
            min={0.5}
            max={100}
            step={0.5}
            className="w-full accent-[var(--accent-blue)]"
            value={roiSliderVal}
            onChange={(e) =>
              setRoiByMode((prev) => ({ ...prev, [mode]: e.target.value }))
            }
          />
          <input
            className="w-28 rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 tabular-nums"
            value={roi}
            onChange={(e) =>
              setRoiByMode((prev) => ({ ...prev, [mode]: e.target.value }))
            }
            placeholder="0.5–100"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">Дедлайн (календарный день)</span>
          <input
            type="date"
            className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
          />
        </label>
        {mode === "plan" ? (
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--text-secondary)]">Стартовый депозит</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 tabular-nums"
              value={planDepositInput}
              onChange={(e) => setPlanDepositInput(e.target.value)}
              placeholder="Пусто = авто"
            />
          </label>
        ) : null}
        {mode === "online" ? (
          <>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-secondary)]">Старт прогноза (дата)</span>
              <input
                type="date"
                className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                value={onlineStartDate}
                onChange={(e) => setOnlineStartDate(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-secondary)]">Депозит на старт</span>
              <input
                className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 tabular-nums"
                value={onlineStartDeposit}
                onChange={(e) => setOnlineStartDeposit(e.target.value)}
                placeholder="Пусто = из журнала"
                disabled={!onlineStartDate.trim()}
              />
            </label>
            <p className="text-[11px] text-[var(--text-secondary)] md:col-span-2">
              Пустая дата — все сделки журнала. Указана дата — только выходы с неё; депозит на
              старт задаёт базу первой строки.
            </p>
          </>
        ) : null}
        <div className="flex flex-wrap items-end gap-2 md:col-span-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm text-white hover:opacity-90 disabled:opacity-50"
          >
            Сохранить параметры прогноза
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-white/5"
            onClick={() => void onSyncBalance()}
          >
            Обновить оценку портфеля
            {portfolioEstimate != null
              ? ` (${formatInQuote(portfolioEstimate, "USDT")})`
              : ""}
          </button>
          <button
            type="button"
            className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm hover:bg-white/5"
            onClick={() => reloadSnapshotOnly()}
          >
            Обновить таблицу
          </button>
        </div>
        {formErr ? <p className="text-sm text-[var(--accent-red)] md:col-span-2">{formErr}</p> : null}
      </form>

      <section className="mb-6 space-y-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="text-lg font-medium">Текущий equity и цель дня</h2>
        {snapshot ? (
          <div className="grid gap-2 text-sm sm:grid-cols-2">
            <p className="text-[var(--text-secondary)]">
              {mode === "plan" ? "Стартовый депозит плана" : "Equity журнала"}:{" "}
              <span className="tabular-nums text-[var(--text-primary)]">
                {formatInQuoteDisplay(snapshot.currentEquityUsdt, snapshot.displayCurrency)}
              </span>
            </p>
            <p className="text-[var(--text-secondary)] sm:col-span-2">
              Цель на день (USDT):{" "}
              <span className="tabular-nums text-[var(--text-primary)]">
                {snapshot.derivativeDayTargetUsdt != null
                  ? formatInQuoteDisplay(snapshot.derivativeDayTargetUsdt, snapshot.displayCurrency)
                  : "—"}
              </span>
            </p>
            <p className="text-[var(--text-secondary)]">
              Сделок до цели:{" "}
              <span className="font-medium tabular-nums text-[var(--text-primary)]">
                {snapshot.tradesToReachGoal != null ? snapshot.tradesToReachGoal : "—"}
              </span>
            </p>
            <p className="text-[var(--text-secondary)]">
              Шагов до цели дня:{" "}
              <span className="font-medium tabular-nums text-[var(--text-primary)]">
                {snapshot.stepsToReachDayGoal != null ? snapshot.stepsToReachDayGoal : "—"}
              </span>
            </p>
            <p className="text-[var(--text-secondary)]">
              Дней:{" "}
              <span className="font-medium tabular-nums text-[var(--text-primary)]">
                {snapshot.daysUntilDeadline != null ? snapshot.daysUntilDeadline : "—"}
              </span>
            </p>
            {progress?.stepsPerDay != null && progress.stepsPerDayIsFractional ? (
              <p className="text-[var(--text-secondary)] sm:col-span-2">
                Темп по графику:{" "}
                <span className="tabular-nums text-[var(--text-primary)]">
                  ≈ {formatStepsPerDay(progress.stepsPerDay)} сдел./день
                </span>
              </p>
            ) : null}
            {mode === "online" && progress?.startedAtYmd ? (
              <>
                <p className="text-[var(--text-secondary)] sm:col-span-2">
                  Старт прогноза:{" "}
                  <span className="text-[var(--text-primary)]">{progress.startedAtYmd}</span>
                  {progress.daysElapsedInclusive != null ? (
                    <>
                      {" "}
                      · прошло дней:{" "}
                      <span className="tabular-nums text-[var(--text-primary)]">
                        {progress.daysElapsedInclusive}
                      </span>
                    </>
                  ) : null}
                </p>
                <p className="text-[var(--text-secondary)]">
                  Сделок с начала:{" "}
                  <span className="tabular-nums text-[var(--text-primary)]">
                    {progress.tradesSinceStart ?? "—"}
                  </span>
                </p>
                <p className="text-[var(--text-secondary)]">
                  С плановым ROI к деп.:{" "}
                  <span className="tabular-nums text-[var(--text-primary)]">
                    {progress.tradesMatchingPlanRoi ?? "—"}
                    {snapshot.forecastTradeRoiPercent != null
                      ? ` (≥ ${formatDisplayPercent(snapshot.forecastTradeRoiPercent)})`
                      : ""}
                  </span>
                </p>
              </>
            ) : null}
          </div>
        ) : (
          <p className="text-[var(--text-secondary)]">{loadErr ?? "Загрузка…"}</p>
        )}
        {ach ? (
          <ul className="list-inside list-disc text-sm text-[var(--text-secondary)]">
            <li className={ach.achieved ? "text-green-400" : ""}>
              {ach.achieved
                ? mode === "online"
                  ? ach.earlyByCalendarDays != null && ach.earlyByCalendarDays > 0
                    ? `Цель депозита достигнута по факту (опережение на ${ach.earlyByCalendarDays} дн.)`
                    : "Цель депозита достигнута по факту"
                  : planAchievementLabel(progress, ach.earlyByCalendarDays)
                : mode === "online"
                  ? "Цель депозита ещё не достигнута по факту"
                  : "Цель депозита не достижима в симуляции"}
            </li>
            {mode === "online" &&
            progress?.aheadByTrades != null &&
            progress.aheadByTrades > 0 ? (
              <li className="text-green-400/90">
                Опережение по сделкам: +{progress.aheadByTrades} к графику
                {progress.expectedTradesBySchedule != null
                  ? ` (ожидалось ≈ ${progress.expectedTradesBySchedule.toLocaleString("ru-RU", {
                      maximumFractionDigits: 1,
                    })}, факт ${progress.tradesSinceStart ?? 0})`
                  : ""}
              </li>
            ) : null}
            {ach.surplusUsdt != null && ach.surplusUsdt > 0 ? (
              <li>
                Излишек:{" "}
                {formatInQuoteDisplay(ach.surplusUsdt, snapshot?.displayCurrency ?? "USDT")}
              </li>
            ) : null}
          </ul>
        ) : null}
      </section>

      <section className="overflow-x-auto">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-medium">Таблица шагов</h2>
          {mode === "online" && snapshot?.rows.some((r) => !r.planned) ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={hideActualRows}
                onChange={(e) => setHideActualRows(e.target.checked)}
              />
              Скрыть закрытые сделки
            </label>
          ) : null}
        </div>
        {loadErr && !snapshot ? (
          <p className="text-sm text-[var(--accent-red)]">{loadErr}</p>
        ) : !snapshot?.rows?.length ? (
          <p className="text-sm text-[var(--text-secondary)]">
            Заполните цель депозита, ROI и дедлайн — появится симуляция и фактический хвост.
          </p>
        ) : (
          <table className="min-w-[900px] w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                <th className="py-2 pr-2">Депо до</th>
                <th className="py-2 pr-2">PnL</th>
                <th className="py-2 pr-2">Депо после</th>
                {mode === "online" ? <th className="py-2 pr-2">ROI к деп.</th> : null}
                {mode === "online" ? (
                  <>
                    <th className="py-2 pr-2">ROI %</th>
                    <th className="py-2 pr-2">Плечо</th>
                    <th className="py-2 pr-2">Закрыто</th>
                  </>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, idx) => {
                const clickable = row.kind === "actual" && row.tradeId
                const onRowClick =
                  clickable
                    ? () => router.push(`/trades/closed?tradeId=${encodeURIComponent(row.tradeId!)}`)
                    : undefined
                const tc = highlightTextClass(row.highlight)
                return (
                  <tr
                    key={`${row.kind}-${idx}-${row.tradeId ?? "p"}-${row.closedAt ?? ""}`}
                    className={`border-b border-[var(--border)] ${rowBg(row)} ${
                      clickable ? "cursor-pointer hover:brightness-110" : ""
                    }`}
                    onClick={onRowClick}
                  >
                    <td className={`py-2 pr-2 tabular-nums ${tc}`}>
                      {formatInQuoteDisplay(row.depositBeforeUsdt, snapshot.displayCurrency)}
                    </td>
                    <td className={`py-2 pr-2 tabular-nums ${tc}`}>
                      {formatInQuoteDisplay(row.pnlUsdt, snapshot.displayCurrency)}
                    </td>
                    <td className={`py-2 pr-2 tabular-nums ${tc}`}>
                      {formatInQuoteDisplay(row.depositAfterUsdt, snapshot.displayCurrency)}
                    </td>
                    {mode === "online" ? (
                      <td className={`py-2 pr-2 tabular-nums ${tc}`}>
                        {row.depositRoiPct != null
                          ? `${formatDisplayPercent(row.depositRoiPct)}%`
                          : "—"}
                      </td>
                    ) : null}
                    {mode === "online" ? (
                      <>
                        <td className={`py-2 pr-2 tabular-nums ${tc}`}>
                          {row.roiActualPct != null
                            ? `${formatDisplayPercent(row.roiActualPct)}%`
                            : "—"}
                        </td>
                        <td className={`py-2 pr-2 ${tc}`}>
                          {row.leverage != null ? `${row.leverage}×` : "—"}
                        </td>
                        <td className="py-2 pr-2 text-xs text-[var(--text-secondary)]">
                          {row.closedAt ? new Date(row.closedAt).toLocaleString() : "—"}
                        </td>
                      </>
                    ) : null}
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
