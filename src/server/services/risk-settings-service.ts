import type { RiskSettingsBalanceSyncDto, RiskSettingsDto } from "@/contracts/risk"
import { cashflowRepository } from "@/server/repositories/cashflow-repository"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"
import { tradesRepository } from "@/server/repositories/trades-repository"
import { buildJournalEquitySummary } from "@/server/trading/equity-timeline"
import type { TradeWithLegs } from "@/server/trading/journal-metrics"
import { riskSettingsPatchSchema } from "@/server/validation/risk-settings"
import { zodErrorMessage } from "@/server/validation/zod-helpers"

function toDto(row: {
  accountBalance: number
  riskPerTrade: number
  riskPerDay: number
  maxDrawdown: number
  maxOpenRisk: number
}): RiskSettingsDto {
  return {
    accountBalance: row.accountBalance,
    riskPerTrade: row.riskPerTrade,
    riskPerDay: row.riskPerDay,
    maxDrawdown: row.maxDrawdown,
    maxOpenRisk: row.maxOpenRisk,
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
    return { ok: true, data: toDto(row) }
  },

  async balanceFromPortfolio(userId: string): Promise<RiskSettingsBalanceSyncDto> {
    const rs = await riskSettingsRepository.upsertDefaults(userId)
    const journalAllAccounts = rs.journalAllAccounts ?? false
    const journalAccountId = rs.activeAccountId ?? undefined

    const cashflows = await cashflowRepository.listForJournalScope(
      userId,
      journalAllAccounts,
      journalAccountId,
    )
    const equityTradesRaw = await tradesRepository.findClosedWithLegsForJournalScope(
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
