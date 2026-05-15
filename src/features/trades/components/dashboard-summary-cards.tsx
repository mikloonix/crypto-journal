"use client"

import type { JournalRiskSummaryDto } from "@/contracts/risk"
import { formatDecimal, formatInQuote, formatPercent } from "@/lib/format-amount"

type Props = {
  balance: number
  totalPnL: number
  roi: number
  openCount: number
  risk?: JournalRiskSummaryDto | null
}

export function DashboardSummaryCards({ balance, totalPnL, roi, openCount, risk }: Props) {
  return (
    <div className="mb-6 space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded bg-[#111] p-4">
          <p className="text-sm text-gray-400">Баланс (оценка)</p>
          <p className="text-xl">{formatInQuote(balance, "USDT")}</p>
        </div>
        <div className="rounded bg-[#111] p-4">
          <p className="text-sm text-gray-400">PnL (закрытые)</p>
          <p className={totalPnL >= 0 ? "text-xl text-green-400" : "text-xl text-red-400"}>
            {formatInQuote(totalPnL, "USDT")}
          </p>
        </div>
        <div className="rounded bg-[#111] p-4">
          <p className="text-sm text-gray-400">ROI / Открыто</p>
          <p className={roi >= 0 ? "text-xl text-green-400" : "text-xl text-red-400"}>
            {formatPercent(roi)}% · открыто: {openCount}
          </p>
        </div>
      </div>

      {risk ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded bg-[#111] p-4">
            <p className="text-sm text-gray-400">Open risk</p>
            <p className="text-lg tabular-nums">
              {formatInQuote(risk.openRiskUsdt, "USDT")}{" "}
              <span className="text-sm text-gray-400">({formatDecimal(risk.openRiskPctSum)}%)</span>
            </p>
          </div>
          <div className="rounded bg-[#111] p-4">
            <p className="text-sm text-gray-400">Риск за день</p>
            <p className="text-lg tabular-nums text-amber-300">{formatDecimal(risk.dailyRiskUsedPct)}%</p>
          </div>
          <div className="rounded bg-[#111] p-4">
            <p className="text-sm text-gray-400">Просадка</p>
            <p className="text-lg tabular-nums">
              {risk.drawdownPct != null ? `${formatDecimal(risk.drawdownPct)}%` : "—"}
            </p>
          </div>
          <div className="rounded bg-[#111] p-4">
            <p className="text-sm text-gray-400">Предупреждения</p>
            {risk.warnings.length === 0 ? (
              <p className="text-sm text-green-400">Нет</p>
            ) : (
              <ul className="mt-1 list-inside list-disc text-xs text-amber-300">
                {risk.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

