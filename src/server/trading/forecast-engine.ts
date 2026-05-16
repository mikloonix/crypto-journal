import { differenceInCalendarDays, parseISO } from "date-fns"
import { formatInTimeZone } from "date-fns-tz"
import type { ForecastAchievementDto, ForecastTableRowDto } from "@/contracts/forecast"

const EPS = 1e-9
const MAX_PLANNED = 5000

export const FORECAST_DEADLINE_YMD_RE = /^\d{4}-\d{2}-\d{2}$/

export function inclusiveCalendarDaysBetweenYmd(todayYmd: string, deadlineYmd: string): number {
  if (!FORECAST_DEADLINE_YMD_RE.test(todayYmd) || !FORECAST_DEADLINE_YMD_RE.test(deadlineYmd)) return 1
  const start = parseISO(`${todayYmd}T12:00:00.000Z`)
  const end = parseISO(`${deadlineYmd}T12:00:00.000Z`)
  const diff = differenceInCalendarDays(end, start)
  return Math.max(1, diff + 1)
}

/** Календарных дней до дедлайна включительно (сегодня и день дедлайна). */
export function calendarDaysUntilDeadlineYmd(todayYmd: string, deadlineYmd: string): number | null {
  if (!FORECAST_DEADLINE_YMD_RE.test(todayYmd) || !FORECAST_DEADLINE_YMD_RE.test(deadlineYmd)) {
    return null
  }
  return inclusiveCalendarDaysBetweenYmd(todayYmd, deadlineYmd)
}

/**
 * Цель на день (USDT): шаги до цели по депозиту распределяются поровну на оставшиеся дни.
 * stepsPerDay = tradesToReachGoal / daysInclusive;
 * PnL дня = компаунд от stepsPerDay сделок с roiPctPerTrade от currentEquityUsdt.
 * Пример: 45 сделок и 45 дней → 1 сделка/день → PnL одного шага по ROI.
 */
export function derivativeDayTargetUsdt(params: {
  currentEquityUsdt: number
  targetDepositUsdt: number
  tradesToReachGoal: number
  roiPctPerTrade: number
  daysInclusive: number
}): number | null {
  const {
    currentEquityUsdt,
    targetDepositUsdt,
    tradesToReachGoal,
    roiPctPerTrade,
    daysInclusive,
  } = params
  if (currentEquityUsdt >= targetDepositUsdt - EPS) return null
  if (tradesToReachGoal <= 0 || daysInclusive <= 0 || roiPctPerTrade <= EPS) return null

  const stepsPerDay = tradesToReachGoal / daysInclusive
  if (stepsPerDay <= EPS) return null

  const r = roiPctPerTrade / 100
  const pnl = currentEquityUsdt * (Math.pow(1 + r, stepsPerDay) - 1)
  if (!Number.isFinite(pnl) || pnl <= EPS) return null
  return pnl
}

export function compoundPnlStep(depositBefore: number, roiPct: number): { pnl: number; depositAfter: number } {
  const pnl = depositBefore * (roiPct / 100)
  return { pnl, depositAfter: depositBefore + pnl }
}

/**
 * Строки плана до цели по депозиту включительно, затем до 10 шагов после достижения.
 */
export function buildPlannedRowsFromDeposit(opts: {
  startDepositUsdt: number
  goalDepositUsdt: number
  roiPctPerTrade: number
}): ForecastTableRowDto[] {
  const { startDepositUsdt, goalDepositUsdt, roiPctPerTrade } = opts
  const rows: ForecastTableRowDto[] = []
  let d = Math.max(startDepositUsdt, 0)
  let afterGoalCount = 0

  while (rows.length < MAX_PLANNED) {
    const { pnl, depositAfter } = compoundPnlStep(d, roiPctPerTrade)
    rows.push({
      kind: "planned",
      tradeId: null,
      closedAt: null,
      depositBeforeUsdt: d,
      pnlUsdt: pnl,
      depositAfterUsdt: depositAfter,
      depositRoiPct: d > EPS ? (pnl / d) * 100 : null,
      roiActualPct: null,
      leverage: null,
      planned: true,
      highlight: "neutral",
      depositGoalStep: false,
      dayGoalStep: false,
    })

    let crossedStep = depositAfter >= goalDepositUsdt - EPS
    if (crossedStep) {
      afterGoalCount += 1
      if (afterGoalCount >= 10) break
    }

    d = depositAfter
    if (!Number.isFinite(d) || d < EPS) break
  }

  return rows
}

export function mergeActualRow(
  row: Omit<ForecastTableRowDto, "highlight" | "planned" | "depositGoalStep" | "dayGoalStep"> & {
    planned?: boolean
  },
): ForecastTableRowDto {
  const r: ForecastTableRowDto = {
    ...row,
    kind: row.kind ?? "actual",
    planned: row.planned ?? false,
    depositRoiPct: row.depositRoiPct ?? null,
    highlight: "neutral",
    depositGoalStep: false,
    dayGoalStep: false,
  }
  if (r.kind === "actual") {
    if (r.pnlUsdt > EPS) r.highlight = "profit"
    else if (r.pnlUsdt < -EPS) r.highlight = "loss"
  }
  return r
}

/** Шагов компаундинга с заданным ROI до первого пересечения цели по депозиту. */
export function countCompoundStepsToGoal(
  startDepositUsdt: number,
  goalDepositUsdt: number,
  roiPctPerTrade: number,
): number {
  if (startDepositUsdt >= goalDepositUsdt - EPS) return 0
  let d = Math.max(startDepositUsdt, 0)
  let n = 0
  while (n < MAX_PLANNED) {
    const { depositAfter } = compoundPnlStep(d, roiPctPerTrade)
    n++
    if (depositAfter >= goalDepositUsdt - EPS) return n
    d = depositAfter
    if (!Number.isFinite(d) || d < EPS) break
  }
  return n
}

/**
 * Онлайн — цель дня: кумулятивный PnL по выходам **текущего календарного дня** (displayTimeZone),
 * затем хвост плановых строк. Порядок как в таблице.
 */
export function buildOnlineDayGoalSequence(
  rows: ForecastTableRowDto[],
  todayYmd: string,
  timeZone: string,
): ForecastTableRowDto[] {
  const actualToday: ForecastTableRowDto[] = []
  const planned: ForecastTableRowDto[] = []
  for (const r of rows) {
    if (r.kind === "planned" || r.planned) {
      planned.push(r)
      continue
    }
    if (r.kind === "actual" && r.closedAt) {
      const ymd = formatInTimeZone(new Date(r.closedAt), timeZone, "yyyy-MM-dd")
      if (ymd === todayYmd) actualToday.push(r)
    }
  }
  return [...actualToday, ...planned]
}

/** Кумулятивный PnL по порядку строк: индекс последней строки, где сумма ≥ target, и число шагов. */
export function resolveCumulativeDayGoal(
  rows: ForecastTableRowDto[],
  dayTargetUsdt: number,
): { goalDayRowIndex: number | null; stepsToReachDayGoal: number | null } {
  if (!Number.isFinite(dayTargetUsdt) || dayTargetUsdt <= EPS) {
    return { goalDayRowIndex: null, stepsToReachDayGoal: null }
  }
  let sum = 0
  for (let i = 0; i < rows.length; i++) {
    sum += rows[i]!.pnlUsdt
    if (sum >= dayTargetUsdt - EPS) {
      return { goalDayRowIndex: i, stepsToReachDayGoal: i + 1 }
    }
  }
  return { goalDayRowIndex: null, stepsToReachDayGoal: null }
}

/**
 * Подсветка строк (как в «План»):
 * — goal_deposit: первое пересечение цели по депозиту (яркий золотой);
 * — goal_day: последняя строка, где кумулятивный PnL ≥ цели дня (тусклый золотой).
 * Маркеры целей перекрывают profit/loss на фактических строках онлайн.
 */
export function reapplyDayGoalHighlight(
  rows: ForecastTableRowDto[],
  goalDepositUsdt: number,
  derivativeDayTargetUsdt: number | null,
  opts?: { dayGoalRows?: ForecastTableRowDto[] },
): void {
  const depositSeq = rows
  const daySeq = opts?.dayGoalRows ?? rows
  const dayGoal = resolveCumulativeDayGoal(daySeq, derivativeDayTargetUsdt ?? NaN)
  const goalDayRow =
    dayGoal.goalDayRowIndex != null ? daySeq[dayGoal.goalDayRowIndex]! : null

  let depositGoalRow: ForecastTableRowDto | null = null
  for (const r of depositSeq) {
    if (r.depositAfterUsdt >= goalDepositUsdt - EPS) {
      depositGoalRow = r
      break
    }
  }

  for (const r of rows) {
    r.depositGoalStep = false
    r.dayGoalStep = false
  }

  if (depositGoalRow != null) {
    depositGoalRow.depositGoalStep = true
  }
  if (goalDayRow != null) {
    goalDayRow.dayGoalStep = true
  }

  for (const r of rows) {
    if (r.depositGoalStep) {
      r.highlight = "goal_deposit"
    } else if (r.dayGoalStep) {
      r.highlight = "goal_day"
    } else if (r.kind === "actual") {
      if (r.pnlUsdt > EPS) r.highlight = "profit"
      else if (r.pnlUsdt < -EPS) r.highlight = "loss"
      else r.highlight = "neutral"
    } else {
      r.highlight = "neutral"
    }
  }
}

export function stepsToReachDayGoalFromRows(
  rows: ForecastTableRowDto[],
  derivativeDayTargetUsdt: number | null,
  dayGoalRows?: ForecastTableRowDto[],
): number | null {
  const seq = dayGoalRows ?? rows
  return resolveCumulativeDayGoal(seq, derivativeDayTargetUsdt ?? NaN).stepsToReachDayGoal
}

export function isFractionalStepsPerDay(stepsPerDay: number): boolean {
  if (!Number.isFinite(stepsPerDay) || stepsPerDay <= EPS) return false
  const nearest = Math.round(stepsPerDay)
  return Math.abs(stepsPerDay - nearest) > 1e-6
}

export function computeForecastPace(params: {
  tradesToReachGoal: number
  daysUntilDeadline: number
}): {
  stepsPerDay: number | null
  stepsPerDayIsFractional: boolean
  calendarDaysToGoalAtSchedule: number | null
  aheadCalendarDaysVsDeadline: number | null
} {
  const { tradesToReachGoal, daysUntilDeadline } = params
  if (tradesToReachGoal <= 0 || daysUntilDeadline <= 0) {
    return {
      stepsPerDay: null,
      stepsPerDayIsFractional: false,
      calendarDaysToGoalAtSchedule: null,
      aheadCalendarDaysVsDeadline: null,
    }
  }
  const stepsPerDay = tradesToReachGoal / daysUntilDeadline
  const calendarDaysToGoalAtSchedule = Math.ceil(tradesToReachGoal / stepsPerDay - EPS)
  let ahead: number | null = null
  if (tradesToReachGoal < daysUntilDeadline) {
    ahead = daysUntilDeadline - tradesToReachGoal
  }
  return {
    stepsPerDay,
    stepsPerDayIsFractional: isFractionalStepsPerDay(stepsPerDay),
    calendarDaysToGoalAtSchedule,
    aheadCalendarDaysVsDeadline: ahead,
  }
}

export function countExitsSinceYmd(
  rows: ForecastTableRowDto[],
  startYmd: string,
  timeZone: string,
): number {
  let n = 0
  for (const r of rows) {
    if (r.kind !== "actual" || !r.closedAt) continue
    const ymd = formatInTimeZone(new Date(r.closedAt), timeZone, "yyyy-MM-dd")
    if (ymd >= startYmd) n++
  }
  return n
}

export function countExitsMatchingPlanRoi(
  rows: ForecastTableRowDto[],
  planRoiPct: number,
  startYmd: string,
  timeZone: string,
): number {
  let n = 0
  for (const r of rows) {
    if (r.kind !== "actual" || !r.closedAt) continue
    const ymd = formatInTimeZone(new Date(r.closedAt), timeZone, "yyyy-MM-dd")
    if (ymd < startYmd) continue
    const roi = r.depositRoiPct
    if (roi != null && Number.isFinite(roi) && roi >= planRoiPct - 0.05) n++
  }
  return n
}

export function buildAchievement(opts: {
  targetDepositUsdt: number
  deadlineYmd: string
  currentEquityUsdt: number
  /** Последнее событие, когда впервые equity >= цель (ISO). */
  firstCrossIso: string | null
  surplusUsdt: number | null
}): ForecastAchievementDto {
  const { targetDepositUsdt, deadlineYmd, currentEquityUsdt, firstCrossIso, surplusUsdt } = opts
  const achievedByEquity = currentEquityUsdt >= targetDepositUsdt - EPS
  const achieved = achievedByEquity || firstCrossIso != null
  const achievedAtIso = achievedByEquity && !firstCrossIso ? null : firstCrossIso
  let earlyByCalendarDays: number | null = null
  if (achievedAtIso != null && FORECAST_DEADLINE_YMD_RE.test(deadlineYmd)) {
    const doneYmd = achievedAtIso.slice(0, 10)
    if (FORECAST_DEADLINE_YMD_RE.test(doneYmd)) {
      const a = parseISO(`${doneYmd}T12:00:00.000Z`)
      const b = parseISO(`${deadlineYmd}T12:00:00.000Z`)
      const diff = differenceInCalendarDays(b, a)
      if (diff > 0) earlyByCalendarDays = diff
    }
  }
  return {
    targetDepositUsdt,
    deadlineYmd,
    achieved,
    achievedAtIso,
    earlyByCalendarDays,
    surplusUsdt,
  }
}
