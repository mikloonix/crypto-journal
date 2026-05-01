"use client"

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts"

export default function EquityChart({ trades }: any) {
  const initialDeposit = 1000

  let balance = initialDeposit

  const data = trades
    .filter((t: any) => t.status === "CLOSED")
    .map((t: any, i: number) => {

      if (!t.exitPrice || !t.entryPrice) return null

      const entry = Number(t.entryPrice)
      const exit = Number(t.exitPrice)
      const volume = Number(t.volume || 0)
      const leverage = Number(t.leverage || 1)
      const feePercent = Number(t.fee || 0)

      const priceDiff =
        t.direction === "LONG"
          ? (exit - entry)
          : (entry - exit)

      const rawPnL = priceDiff * volume * leverage

      const feeCost =
        (entry * volume + exit * volume) * (feePercent / 100)

      const pnl = rawPnL - feeCost

      balance += pnl

      const roi = ((balance - initialDeposit) / initialDeposit) * 100

      return {
        trade: i + 1,
        balance: Number(balance.toFixed(2)),
        pnl: Number(pnl.toFixed(2)),
        roi: Number(roi.toFixed(2))
      }
    })
    .filter(Boolean)

  return (
    <div className="bg-[#111] p-4 rounded-2xl mb-6">
      <h2 className="mb-4">Equity Curve</h2>

      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <XAxis dataKey="trade" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="balance" stroke="#4ade80" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}