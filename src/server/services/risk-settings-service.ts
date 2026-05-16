import type { RiskSettingsBalanceSyncDto, RiskSettingsDto } from "@/contracts/risk"
import { cashflowRepository } from "@/server/repositories/cashflow-repository"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"
import { tradesRepository } from "@/server/repositories/trades-repository"
import { accountRepository } from "@/server/repositories/account-repository"
import { buildJournalEquitySummary } from "@/server/trading/equity-timeline"
import type { TradeWithLegs } from "@/server/trading/journal-metrics"
import { formatInTimeZone } from "date-fns-tz"
import { countCompoundStepsToGoal, FORECAST_DEADLINE_YMD_RE } from "@/server/trading/forecast-engine"
import { riskSettingsPatchSchema } from "@/server/validation/risk-settings"
import { zodErrorMessage } from "@/server/validation/zod-helpers"

const EPS = 1e-9

function toDto(row: {
  accountBalance: number
  riskPerTrade: number
  riskPerDay: number
  maxDrawdown: number
  maxOpenRisk: number
  forecastDepositTargetUsdt: number | null
  forecastPlanDepositTargetUsdt: number | null
  forecastTradeRoiPercent: number | null
  forecastPlanTradeRoiPercent: number | null
  forecastDeadlineYmd: string | null
  forecastStartedAtYmd: string | null
  forecastStartEquityUsdt: number | null
}): RiskSettingsDto {
  return {
    accountBalance: row.accountBalance,
    riskPerTrade: row.riskPerTrade,
    riskPerDay: row.riskPerDay,
    maxDrawdown: row.maxDrawdown,
    maxOpenRisk: row.maxOpenRisk,
    forecastDepositTargetUsdt: row.forecastDepositTargetUsdt ?? null,
    forecastPlanDepositTargetUsdt: row.forecastPlanDepositTargetUsdt ?? null,
    forecastTradeRoiPercent: row.forecastTradeRoiPercent ?? null,
    forecastPlanTradeRoiPercent: row.forecastPlanTradeRoiPercent ?? null,
    forecastDeadlineYmd: row.forecastDeadlineYmd ?? null,
    forecastStartedAtYmd: row.forecastStartedAtYmd ?? null,
    forecastStartEquityUsdt: row.forecastStartEquityUsdt ?? null,
  }
}

function toTradeWithLegs(row: TradeWithLegs): TradeWithLegs {
  return {
    ...row,
    exits: row.exits.filter((e) => e.deletedAt == null),
  }
}

export const riskSettingsService = {
  async get(userId: string): Promise<RiskSettingsDto> {
    const row = await riskSettingsRepository.upsertDefaults(userId)
    return toDto(row)
  },

  async patch(
    userId: string,
    body: unknown,
  ): Promise<{ ok: true; data: RiskSettingsDto } | { ok: false; error: string; status: number }> {
    const parsed = riskSettingsPatchSchema.safeParse(body)
    if (!parsed.success) {
      return { ok: false, error: zodErrorMessage(parsed.error), status: 400 }
    }
    if (Object.keys(parsed.data).length === 0) {
      return { ok: false, error: "Нет полей для обновления", status: 400 }
    }
    const row = await riskSettingsRepository.patchRiskLimits(userId, parsed.data)

    if (parsed.data.forecastStartedAtYmd === null) {
      const cleared = await riskSettingsRepository.patchRiskLimits(userId, {
        forecastStartedAtYmd: null,
        forecastStartEquityUsdt: null,
        forecastStartTradesToGoal: null,
      })
      return { ok: true, data: toDto(cleared) }
    }

    const startTouched =
      parsed.data.forecastStartedAtYmd !== undefined ||
      parsed.data.forecastStartEquityUsdt !== undefined

    if (startTouched) {
      const merged = await riskSettingsRepository.upsertDefaults(userId)
      const goal = merged.forecastDepositTargetUsdt
      const roi = merged.forecastTradeRoiPercent
      const startYmd = merged.forecastStartedAtYmd
      const startEquity = merged.forecastStartEquityUsdt

      if (
        startYmd != null &&
        FORECAST_DEADLINE_YMD_RE.test(startYmd) &&
        goal != null &&
        roi != null &&
        Number(goal) > EPS &&
        Number(roi) > EPS &&
        startEquity != null &&
        startEquity > EPS
      ) {
        const tradesToGoal = countCompoundStepsToGoal(
          startEquity,
          Number(goal),
          Number(roi),
        )
        const updated = await riskSettingsRepository.patchRiskLimits(userId, {
          forecastStartTradesToGoal: tradesToGoal,
        })
        return { ok: true, data: toDto(updated) }
      }
    }

    return { ok: true, data: toDto(row) }
  },

  async balanceFromPortfolio(userId: string): Promise<RiskSettingsBalanceSyncDto> {
    const rs = await riskSettingsRepository.upsertDefaults(userId)
    const journalAllAccounts = rs.journalAllAccounts ?? false
    const journalAccountId = rs.activeAccountId ?? undefined

    const legacyCashflowAccountId = await accountRepository.findDefaultAccountId(userId)

    const cashflows = await cashflowRepository.listForJournalScope(
      userId,
      journalAllAccounts,
      journalAccountId,
      legacyCashflowAccountId ?? undefined,
    )
    const equityTradesRaw = await tradesRepository.findTradesWithLegsForJournalEquity(
      userId,
      journalAllAccounts,
      journalAccountId,
    )
    const equityTrades = equityTradesRaw.map((t) => toTradeWithLegs(t as TradeWithLegs))
    const openRows = await tradesRepository.findManyActiveWithLegs(userId)
    const openCount = openRows.filter((t) => t.status === "OPEN").length

    const summary = buildJournalEquitySummary(equityTrades, cashflows, {
      journalAllAccounts,
      journalAccountId,
      ...(legacyCashflowAccountId ? { legacyCashflowAccountId } : {}),
    }, { openCount })

    return {
      balanceEstimateUsdt: summary.balanceEstimateUsdt,
      totalPnlClosedUsdt: summary.totalPnlClosedUsdt,
      openCount,
    }
  },

  async syncBalanceFromPortfolio(
    userId: string,
  ): Promise<
    | { ok: true; data: RiskSettingsDto & { syncedBalanceUsdt: number } }
    | { ok: false; error: string; status: number }
  > {
    const snap = await this.balanceFromPortfolio(userId)
    if (!(snap.balanceEstimateUsdt > 0)) {
      return {
        ok: false,
        error: "Не удалось оценить баланс (нет cashflow и закрытых сделок)",
        status: 400,
      }
    }
    const row = await riskSettingsRepository.patchRiskLimits(userId, {
      accountBalance: snap.balanceEstimateUsdt,
    })
    return {
      ok: true,
      data: { ...toDto(row), syncedBalanceUsdt: snap.balanceEstimateUsdt },
    }
  },
}
