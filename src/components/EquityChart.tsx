"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts"
import type { EquityCurvePointDto } from "@/contracts/trades"
import { formatDecimal, formatInQuote } from "@/lib/format-amount"

export default function EquityChart({ equityCurve }: { equityCurve: EquityCurvePointDto[] }) {
  const data = equityCurve.map((p) => ({
    trade: p.tradeIndex,
    balance: p.balance,
    pnl: p.pnl,
    roi: p.roi,
    stepKind: p.event === "cashflow" ? "Ввод/вывод" : "Сделка",
  }))

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
            labelFormatter={(label, payload) => {
              const kind = (payload?.[0]?.payload as { stepKind?: string } | undefined)?.stepKind
              return kind ? `${kind} · шаг ${label}` : `Шаг ${label}`
            }}
          />
          <Line type="monotone" dataKey="balance" stroke="#4ade80" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
