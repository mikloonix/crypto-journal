"use client"

import { formatInQuote, formatPercent } from "@/lib/format-amount"

type Props = {
  balance: number
  totalPnL: number
  roi: number
  openCount: number
}

export function DashboardSummaryCards({ balance, totalPnL, roi, openCount }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
      <div className="bg-[#111] p-4 rounded">
        <p className="text-gray-400 text-sm">Баланс (оценка)</p>
        <p className="text-xl">{formatInQuote(balance, "USDT")}</p>
      </div>
      <div className="bg-[#111] p-4 rounded">
        <p className="text-gray-400 text-sm">PnL (закрытые)</p>
        <p className={totalPnL >= 0 ? "text-xl text-green-400" : "text-xl text-red-400"}>
          {formatInQuote(totalPnL, "USDT")}
        </p>
      </div>
      <div className="bg-[#111] p-4 rounded">
        <p className="text-gray-400 text-sm">ROI / Открыто</p>
        <p className={roi >= 0 ? "text-xl text-green-400" : "text-xl text-red-400"}>
          {formatPercent(roi)}% · открыто: {openCount}
        </p>
      </div>
    </div>
  )
}
