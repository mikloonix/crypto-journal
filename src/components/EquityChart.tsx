"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import type { Trade, Entry, Exit } from "@prisma/client"
import { calculateTradePnL } from "@/lib/risk-manager"
import { formatDecimal, formatInQuote } from "@/lib/format-amount"

export type TradeWithLegs = Trade & { entries: Entry[]; exits: Exit[] }

const INITIAL_DEPOSIT = 1000

export default function EquityChart({ trades }: { trades: TradeWithLegs[] }) {
  let balance = INITIAL_DEPOSIT

  const closed = trades
    .filter((t): t is TradeWithLegs => t.status === "CLOSED" && t.closedAt != null)
    .slice()
    .sort((a, b) => new Date(a.closedAt!).getTime() - new Date(b.closedAt!).getTime())

  const data = closed.map((t, i) => {
    const pnl = calculateTradePnL(t)
    balance += pnl
    const roi = ((balance - INITIAL_DEPOSIT) / INITIAL_DEPOSIT) * 100
    return {
      trade: i + 1,
      balance,
      pnl,
      roi,
    }
  })

  return (
    <div className="bg-[#111] p-4 rounded-2xl mb-6">
      <h2 className="mb-4">Equity Curve</h2>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <XAxis dataKey="trade" />
          <YAxis tickFormatter={(v) => formatDecimal(Number(v))} />
          <Tooltip
            formatter={(value: number | string) => [
              formatInQuote(Number(value), "USDT"),
              "Баланс",
            ]}
            labelFormatter={(label) => `Трейд ${label}`}
          />
          <Line type="monotone" dataKey="balance" stroke="#4ade80" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
