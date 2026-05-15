import type { RiskEvaluateResponseDto } from "@/contracts/risk"
import { TradeStatus } from "@prisma/client"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"
import { tradesRepository } from "@/server/repositories/trades-repository"
import { cashflowRepository } from "@/server/repositories/cashflow-repository"
import { accountRepository } from "@/server/repositories/account-repository"
import { buildJournalEquitySummary } from "@/server/trading/equity-timeline"
import { buildJournalRiskPack } from "@/server/trading/attach-journal-risk"
import type { TradeWithLegs } from "@/server/trading/journal-metrics"
import { z } from "zod"
import { zodErrorMessage } from "@/server/validation/zod-helpers"

const evaluateBodySchema = z
  .object({
    markPrices: z.record(z.coerce.number().positive()).optional(),
    markPricesByTradeId: z.record(z.coerce.number().positive()).optional(),
    accountId: z.string().min(1).optional(),
  })
  .strict()

function toTradeWithLegs(row: TradeWithLegs): TradeWithLegs {
  return {
    ...row,
    exits: row.exits.filter((e) => e.deletedAt == null),
  }
}

export const riskEvaluationService = {
  async evaluate(
    userId: string,
    body: unknown,
  ): Promise<
    { ok: true; data: RiskEvaluateResponseDto } | { ok: false; error: string; status: number }
  > {
    const parsed = evaluateBodySchema.safeParse(body)
    if (!parsed.success) {
      return { ok: false, error: zodErrorMessage(parsed.error), status: 400 }
    }

    const rs = await riskSettingsRepository.upsertDefaults(userId)
    const journalAllAccounts = rs.journalAllAccounts ?? false
    const journalAccountId =
      parsed.data.accountId?.trim() || rs.activeAccountId || undefined

    const legacyCashflowAccountId = await accountRepository.findDefaultAccountId(userId)
    const scope = {
      journalAllAccounts,
      journalAccountId,
      ...(legacyCashflowAccountId ? { legacyCashflowAccountId } : {}),
    }
    const raw = journalAllAccounts
      ? await tradesRepository.findManyActiveWithLegs(userId)
      : await tradesRepository.findOpenTradesWithLegs(userId, journalAccountId)

    const rows = raw.map((t) => toTradeWithLegs(t as TradeWithLegs))

    let cashflows: Awaited<ReturnType<typeof cashflowRepository.listForJournalScope>> = []
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

    const equityTradesRaw = await tradesRepository.findClosedWithLegsForJournalScope(
      userId,
      journalAllAccounts,
      journalAccountId,
    )
    const equityTrades = equityTradesRaw.map((t) => toTradeWithLegs(t as TradeWithLegs))
    const summary = buildJournalEquitySummary(equityTrades, cashflows, scope, {
      openCount: rows.filter((t) => t.status === TradeStatus.OPEN).length,
    })

    const { perTrade, summary: riskSummary } = await buildJournalRiskPack(
      userId,
      rows,
      summary,
      scope,
      {
        markPrices: parsed.data.markPrices,
        markPricesByTradeId: parsed.data.markPricesByTradeId,
      },
    )

    const openTrades = rows
      .filter((t) => t.status === TradeStatus.OPEN)
      .map((t) => ({
        tradeId: t.id,
        symbol: t.symbol,
        risk: perTrade.get(t.id) ?? {
          status: "NA" as const,
          riskUsdt: null,
          riskPct: null,
          reasons: [],
        },
      }))

    return {
      ok: true,
      data: {
        summary: riskSummary,
        openTrades,
      },
    }
  },
}
