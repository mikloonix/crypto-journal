import { TradeStatus } from "@prisma/client"
import type { Cashflow, Exit } from "@prisma/client"
import { pnlRoiForExitLeg } from "@/lib/exit-leg-pnl"
import type {
  ForecastAchievementDto,
  ForecastProgressDto,
  ForecastSnapshotDto,
  ForecastTableRowDto,
} from "@/contracts/forecast"
import { accountRepository } from "@/server/repositories/account-repository"
import { cashflowRepository } from "@/server/repositories/cashflow-repository"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"
import { tradesRepository } from "@/server/repositories/trades-repository"
import type { JournalEquityScope } from "@/server/trading/cashflow-usdt"
import {
  buildAchievement,
  buildOnlineDayGoalSequence,
  buildPlannedRowsFromDeposit,
  calendarDaysUntilDeadlineYmd,
  computeForecastPace,
  countCompoundStepsToGoal,
  countExitsMatchingPlanRoi,
  countExitsSinceYmd,
  derivativeDayTargetUsdt as computeDerivativeDayTarget,
  FORECAST_DEADLINE_YMD_RE,
  inclusiveCalendarDaysBetweenYmd,
  mergeActualRow,
  reapplyDayGoalHighlight,
  stepsToReachDayGoalFromRows,
} from "@/server/trading/forecast-engine"
import type { TradeWithLegs } from "@/server/trading/journal-metrics"
import {
  buildJournalEquitySummary,
  equityUsdtBeforeExitLeg,
} from "@/server/trading/equity-timeline"
import { tradeLeverageFromEntries } from "@/server/trading/position-margin"
import { formatInTimeZone } from "date-fns-tz"

const EPS = 1e-9

function toTradeWithLegs(row: TradeWithLegs): TradeWithLegs {
  return {
    ...row,
    exits: row.exits.filter((e) => e.deletedAt == null),
  }
}

function sortCashflowsAsc(cashflows: Cashflow[]): Cashflow[] {
  if (cashflows.length <= 1) return cashflows
  return [...cashflows].sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime())
}

function resolveForecastRoiPercent(
  rs: {
    forecastTradeRoiPercent: number | null
    forecastPlanTradeRoiPercent: number | null
  },
  mode: "plan" | "online",
): number | null {
  if (mode === "plan") {
    const p = rs.forecastPlanTradeRoiPercent ?? rs.forecastTradeRoiPercent
    return p != null ? Number(p) : null
  }
  const o = rs.forecastTradeRoiPercent
  return o != null ? Number(o) : null
}

function filterExitEventsFromYmd(
  events: { trade: TradeWithLegs; exit: Exit }[],
  startYmd: string | null,
  timeZone: string,
): { trade: TradeWithLegs; exit: Exit }[] {
  if (startYmd == null || !FORECAST_DEADLINE_YMD_RE.test(startYmd)) return events
  return events.filter(({ exit }) => {
    const ymd = formatInTimeZone(exit.timestamp, timeZone, "yyyy-MM-dd")
    return ymd >= startYmd
  })
}

function collectExitEvents(trades: TradeWithLegs[]): { trade: TradeWithLegs; exit: Exit }[] {
  const events: { trade: TradeWithLegs; exit: Exit }[] = []
  for (const t of trades) {
    for (const ex of t.exits) {
      if (ex.deletedAt != null) continue
      events.push({ trade: t, exit: ex })
    }
  }
  events.sort((a, b) => {
    const ta = a.exit.timestamp.getTime()
    const tb = b.exit.timestamp.getTime()
    if (ta !== tb) return ta - tb
    return a.exit.id.localeCompare(b.exit.id)
  })
  return events
}

function buildForecastProgress(opts: {
  mode: "plan" | "online"
  tradesToReachGoal: number
  daysUntilDeadline: number
  rows: ForecastTableRowDto[]
  tz: string
  todayYmd: string
  deadlineYmd: string
  roiNum: number
  startedAtYmd: string | null
  startTradesToGoal: number | null
}): ForecastProgressDto | null {
  const {
    mode,
    tradesToReachGoal,
    daysUntilDeadline,
    rows,
    tz,
    todayYmd,
    deadlineYmd,
    roiNum,
    startedAtYmd,
    startTradesToGoal,
  } = opts

  if (tradesToReachGoal <= 0 || daysUntilDeadline <= 0) return null

  const pace = computeForecastPace({ tradesToReachGoal, daysUntilDeadline })

  let daysElapsedInclusive: number | null = null
  let tradesSinceStart: number | null = null
  let tradesMatchingPlanRoi: number | null = null
  let expectedTradesBySchedule: number | null = null
  let aheadByTrades: number | null = null

  if (
    startedAtYmd != null &&
    FORECAST_DEADLINE_YMD_RE.test(startedAtYmd) &&
    FORECAST_DEADLINE_YMD_RE.test(deadlineYmd)
  ) {
    daysElapsedInclusive = inclusiveCalendarDaysBetweenYmd(startedAtYmd, todayYmd)
    if (mode === "online") {
      tradesSinceStart = countExitsSinceYmd(rows, startedAtYmd, tz)
      tradesMatchingPlanRoi = countExitsMatchingPlanRoi(rows, roiNum, startedAtYmd, tz)

      if (startTradesToGoal != null && startTradesToGoal > 0) {
        const daysAtStart = inclusiveCalendarDaysBetweenYmd(startedAtYmd, deadlineYmd)
        if (daysAtStart > 0) {
          const stepsPerDayAtStart = startTradesToGoal / daysAtStart
          expectedTradesBySchedule = daysElapsedInclusive * stepsPerDayAtStart
          const diff = tradesSinceStart - expectedTradesBySchedule
          if (diff > EPS) aheadByTrades = Math.floor(diff + EPS)
        }
      }
    }
  }

  return {
    ...pace,
    startedAtYmd,
    daysElapsedInclusive,
    tradesSinceStart,
    tradesMatchingPlanRoi,
    expectedTradesBySchedule,
    aheadByTrades,
  }
}

function resolvePlanStartDepositUsdt(
  mode: "plan" | "online",
  planDepositOverride: number | null | undefined,
  currentEquityUsdt: number,
  accountBalance: number,
): number {
  if (mode !== "plan") return currentEquityUsdt
  return Math.max(
    planDepositOverride != null &&
      Number.isFinite(planDepositOverride) &&
      planDepositOverride > 0
      ? Number(planDepositOverride)
      : currentEquityUsdt > 0
        ? currentEquityUsdt
        : accountBalance,
    0,
  )
}

function cashflowsStrictlyBefore(sortedAsc: Cashflow[], beforeUtc: Date): Cashflow[] {
  const cut = beforeUtc.getTime()
  let lo = 0
  let hi = sortedAsc.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (sortedAsc[mid]!.timestamp.getTime() < cut) lo = mid + 1
    else hi = mid
  }
  return sortedAsc.slice(0, lo)
}

type ForecastJournalBasis = {
  rs: Awaited<ReturnType<typeof riskSettingsRepository.upsertDefaults>>
  forecastStartedAtYmd: string | null
  forecastStartEquityUsdt: number | null
  forecastStartTradesToGoal: number | null
  legacyCashflowAccountId: string | null
  journalAllAccounts: boolean
  journalAccountId: string | undefined
  cfSorted: Cashflow[]
  equityTrades: TradeWithLegs[]
  scope: JournalEquityScope
  journalHasCashflow: boolean
  openCount: number
  currentEquityUsdt: number
  tz: string
}

async function loadForecastJournalBasis(userId: string): Promise<ForecastJournalBasis> {
  const [rs, legacyCashflowAccountId] = await Promise.all([
    riskSettingsRepository.upsertDefaults(userId),
    accountRepository.findDefaultAccountId(userId),
  ])

  const journalAllAccounts = rs.journalAllAccounts ?? false
  const journalAccountId = rs.activeAccountId ?? undefined
  const tz = (rs.displayTimeZone && String(rs.displayTimeZone).trim()) || "UTC"

  let cashflows: Cashflow[] = []
  try {
    cashflows = await cashflowRepository.listForJournalScope(
      userId,
      journalAllAccounts,
      journalAccountId,
      legacyCashflowAccountId ?? undefined,
    )
  } catch {
    /* optional */
  }
  const cfSorted = sortCashflowsAsc(cashflows)
  const equityTradesRaw = await tradesRepository.findTradesWithLegsForJournalEquity(
    userId,
    journalAllAccounts,
    journalAccountId,
  )
  const equityTrades = equityTradesRaw.map((t) => toTradeWithLegs(t as TradeWithLegs))
  const journalHasCashflow = cashflows.length > 0

  const scope: JournalEquityScope = {
    journalAllAccounts,
    journalAccountId,
    ...(legacyCashflowAccountId ? { legacyCashflowAccountId } : {}),
  }

  const openRows = await tradesRepository.findManyActiveWithLegs(userId)
  const openCount = openRows.filter((t) => t.status === TradeStatus.OPEN).length
  const summary = buildJournalEquitySummary(equityTrades, cfSorted, scope, {
    openCount,
  })
  const currentEquityUsdt = Number.isFinite(summary.balanceEstimateUsdt)
    ? summary.balanceEstimateUsdt
    : 0

  return {
    rs,
    forecastStartedAtYmd: rs.forecastStartedAtYmd ?? null,
    forecastStartEquityUsdt:
      rs.forecastStartEquityUsdt != null ? Number(rs.forecastStartEquityUsdt) : null,
    forecastStartTradesToGoal: rs.forecastStartTradesToGoal ?? null,
    legacyCashflowAccountId,
    journalAllAccounts,
    journalAccountId,
    cfSorted,
    equityTrades,
    scope,
    journalHasCashflow,
    openCount,
    currentEquityUsdt,
    tz,
  }
}

export const forecastService = {
  async getDerivativeForDashboard(userId: string): Promise<{
    derivativeDayTargetUsdt: number | null
    forecastConfigured: boolean
  }> {
    const basis = await loadForecastJournalBasis(userId)
    const { rs, currentEquityUsdt, tz } = basis
    const goal = rs.forecastDepositTargetUsdt
    const roiPct = rs.forecastTradeRoiPercent
    const deadlineYmd = rs.forecastDeadlineYmd

    const forecastConfigured = Boolean(
      goal != null &&
        roiPct != null &&
        deadlineYmd != null &&
        FORECAST_DEADLINE_YMD_RE.test(deadlineYmd) &&
        Number.isFinite(Number(goal)) &&
        Number(goal) > EPS &&
        Number(roiPct) > EPS,
    )

    if (!forecastConfigured) {
      return { derivativeDayTargetUsdt: null, forecastConfigured: false }
    }

    const goalNum = Number(goal)
    const roiNum = Number(roiPct)
    const todayYmd = formatInTimeZone(new Date(), tz, "yyyy-MM-dd")
    const daysInclusive = calendarDaysUntilDeadlineYmd(todayYmd, deadlineYmd!) ?? 1
    const tradesToReach =
      currentEquityUsdt >= goalNum - EPS
        ? 0
        : countCompoundStepsToGoal(currentEquityUsdt, goalNum, roiNum)

    let derivativeDay: number | null = null
    if (tradesToReach > 0) {
      derivativeDay = computeDerivativeDayTarget({
        currentEquityUsdt,
        targetDepositUsdt: goalNum,
        tradesToReachGoal: tradesToReach,
        roiPctPerTrade: roiNum,
        daysInclusive,
      })
    }

    return {
      derivativeDayTargetUsdt: derivativeDay,
      forecastConfigured: true,
    }
  },

  async getSnapshot(
    userId: string,
    mode: "plan" | "online",
    planDepositOverride?: number | null,
  ): Promise<{ ok: true; data: ForecastSnapshotDto } | { ok: false; error: string; status: number }> {
    const basis = await loadForecastJournalBasis(userId)
    const {
      rs,
      forecastStartedAtYmd,
      forecastStartEquityUsdt: onlineStartEquity,
      forecastStartTradesToGoal,
      cfSorted,
      equityTrades,
      scope,
      journalHasCashflow,
      currentEquityUsdt,
      tz,
    } = basis

    const todayYmd = formatInTimeZone(new Date(), tz, "yyyy-MM-dd")
    const onlineGoalRaw = rs.forecastDepositTargetUsdt
    const planGoalRaw = rs.forecastPlanDepositTargetUsdt
    const roiPct = resolveForecastRoiPercent(rs, mode)
    const onlineRoiRaw = rs.forecastTradeRoiPercent
    const planRoiRaw = rs.forecastPlanTradeRoiPercent ?? rs.forecastTradeRoiPercent
    const deadlineYmd = rs.forecastDeadlineYmd

    const goalRaw = mode === "plan" ? planGoalRaw : onlineGoalRaw

    if (
      goalRaw == null ||
      roiPct == null ||
      deadlineYmd == null ||
      !FORECAST_DEADLINE_YMD_RE.test(deadlineYmd) ||
      !Number.isFinite(goalRaw) ||
      goalRaw <= 0 ||
      roiPct <= 0
    ) {
      return {
        ok: true,
        data: {
          mode,
          forecastDepositTargetUsdt: onlineGoalRaw ?? null,
          forecastPlanDepositTargetUsdt: planGoalRaw ?? null,
          forecastTradeRoiPercent: onlineRoiRaw != null ? Number(onlineRoiRaw) : null,
          forecastPlanTradeRoiPercent: planRoiRaw != null ? Number(planRoiRaw) : null,
          forecastDeadlineYmd: deadlineYmd ?? null,
          forecastStartedAtYmd: forecastStartedAtYmd ?? null,
          forecastStartEquityUsdt: onlineStartEquity,
          daysUntilDeadline:
            deadlineYmd && FORECAST_DEADLINE_YMD_RE.test(deadlineYmd)
              ? calendarDaysUntilDeadlineYmd(todayYmd, deadlineYmd)
              : null,
          rows: [],
          achievement: null,
          derivativeDayTargetUsdt: null,
          tradesToReachGoal: null,
          stepsToReachDayGoal: null,
          progress: null,
          currentEquityUsdt,
          journalEquityUsdt: currentEquityUsdt,
          displayCurrency: "USDT",
        },
      }
    }

    const goalNum = Number(goalRaw)
    const roiNum = Number(roiPct)

    const planStartDeposit = resolvePlanStartDepositUsdt(
      mode,
      planDepositOverride,
      currentEquityUsdt,
      rs.accountBalance,
    )
    const contextEquityUsdt = mode === "plan" ? planStartDeposit : currentEquityUsdt

    const daysUntilDeadline =
      calendarDaysUntilDeadlineYmd(todayYmd, deadlineYmd) ?? 1

    const tradesToReachGoal =
      contextEquityUsdt >= goalNum - EPS
        ? 0
        : countCompoundStepsToGoal(contextEquityUsdt, goalNum, roiNum)

    let derivativeDay: number | null = null
    if (tradesToReachGoal > 0) {
      derivativeDay = computeDerivativeDayTarget({
        currentEquityUsdt: contextEquityUsdt,
        targetDepositUsdt: goalNum,
        tradesToReachGoal,
        roiPctPerTrade: roiNum,
        daysInclusive: daysUntilDeadline,
      })
    }

    let rows: ForecastTableRowDto[] = []
    let firstCrossIso: string | null = null
    let surplusUsdt: number | null =
      contextEquityUsdt >= goalNum - EPS ? contextEquityUsdt - goalNum : null

    let achievement: ForecastAchievementDto

    if (mode === "plan") {
      const s0 = planStartDeposit
      rows = buildPlannedRowsFromDeposit({
        startDepositUsdt: s0,
        goalDepositUsdt: goalNum,
        roiPctPerTrade: roiNum,
      })

      let surplusPlan: number | null = null
      if (s0 >= goalNum - EPS) surplusPlan = s0 - goalNum
      else {
        for (const r of rows) {
          if (r.depositAfterUsdt >= goalNum - EPS) {
            surplusPlan = r.depositAfterUsdt - goalNum
            break
          }
        }
      }

      const pathCross = rows.some((r) => r.depositAfterUsdt >= goalNum - EPS)
      const planPace = computeForecastPace({ tradesToReachGoal, daysUntilDeadline })
      achievement = {
        targetDepositUsdt: goalNum,
        deadlineYmd,
        achieved: s0 >= goalNum - EPS || pathCross,
        achievedAtIso: null,
        earlyByCalendarDays: planPace.aheadCalendarDaysVsDeadline,
        surplusUsdt: surplusPlan,
      }
    } else {
      let exitEvents = collectExitEvents(equityTrades)
      exitEvents = filterExitEventsFromYmd(exitEvents, forecastStartedAtYmd, tz)
      let firstInWindow = true
      for (const { trade: t, exit: ex } of exitEvents) {
        const at = ex.timestamp
        const depositBeforeRaw = equityUsdtBeforeExitLeg(
          at,
          equityTrades,
          cfSorted,
          scope,
          journalHasCashflow,
        )
        let depositBefore = Number.isFinite(depositBeforeRaw) ? depositBeforeRaw : 0
        if (
          firstInWindow &&
          onlineStartEquity != null &&
          Number.isFinite(onlineStartEquity) &&
          onlineStartEquity > EPS
        ) {
          depositBefore = onlineStartEquity
        }
        firstInWindow = false
        const leg = pnlRoiForExitLeg(t.direction, t.entries, ex)
        const pnl = leg.pnl
        const depositAfter = depositBefore + pnl
        const depositRoiPct = depositBefore > EPS ? (pnl / depositBefore) * 100 : null
        const lev = tradeLeverageFromEntries(t.entries)
        const roiAct =
          leg.roiPct != null && Number.isFinite(leg.roiPct)
            ? leg.roiPct
            : depositRoiPct
        rows.push(
          mergeActualRow({
            kind: "actual",
            tradeId: t.id,
            closedAt: at.toISOString(),
            depositBeforeUsdt: depositBefore,
            pnlUsdt: pnl,
            depositAfterUsdt: depositAfter,
            depositRoiPct,
            roiActualPct: roiAct,
            leverage: lev,
            planned: false,
          }),
        )
        if (firstCrossIso == null && depositAfter >= goalNum - EPS) {
          firstCrossIso = at.toISOString()
          surplusUsdt = depositAfter - goalNum
        }
      }

      const lastDeposit =
        rows.length > 0
          ? rows[rows.length - 1]!.depositAfterUsdt
          : onlineStartEquity != null && onlineStartEquity > EPS
            ? onlineStartEquity
            : currentEquityUsdt

      const plannedTail = buildPlannedRowsFromDeposit({
        startDepositUsdt: Math.max(lastDeposit, 0),
        goalDepositUsdt: goalNum,
        roiPctPerTrade: roiNum,
      })
      rows.push(...plannedTail)

      achievement = buildAchievement({
        targetDepositUsdt: goalNum,
        deadlineYmd,
        currentEquityUsdt,
        firstCrossIso,
        surplusUsdt,
      })
    }

    const dayGoalRows =
      mode === "online" ? buildOnlineDayGoalSequence(rows, todayYmd, tz) : rows

    reapplyDayGoalHighlight(rows, goalNum, derivativeDay, { dayGoalRows })

    const stepsToReachDayGoal =
      derivativeDay != null
        ? stepsToReachDayGoalFromRows(rows, derivativeDay, dayGoalRows)
        : null

    const progress = buildForecastProgress({
      mode,
      tradesToReachGoal,
      daysUntilDeadline,
      rows,
      tz,
      todayYmd,
      deadlineYmd,
      roiNum,
      startedAtYmd: forecastStartedAtYmd,
      startTradesToGoal: forecastStartTradesToGoal,
    })

    return {
      ok: true,
      data: {
        mode,
        forecastDepositTargetUsdt: onlineGoalRaw != null ? Number(onlineGoalRaw) : null,
        forecastPlanDepositTargetUsdt: planGoalRaw != null ? Number(planGoalRaw) : null,
        forecastTradeRoiPercent: onlineRoiRaw != null ? Number(onlineRoiRaw) : null,
        forecastPlanTradeRoiPercent: planRoiRaw != null ? Number(planRoiRaw) : null,
        forecastDeadlineYmd: deadlineYmd,
        forecastStartedAtYmd: forecastStartedAtYmd ?? null,
        forecastStartEquityUsdt: onlineStartEquity,
        daysUntilDeadline,
        rows,
        achievement,
        derivativeDayTargetUsdt: derivativeDay,
        tradesToReachGoal,
        stepsToReachDayGoal,
        progress,
        currentEquityUsdt: contextEquityUsdt,
        journalEquityUsdt: currentEquityUsdt,
        displayCurrency: "USDT",
      },
    }
  },
}
