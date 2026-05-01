"use client"

import { useEffect, useState } from "react"
import EquityChart from "@/components/EquityChart"

export default function Dashboard() {
  const [trades, setTrades] = useState<any[]>([])
  const [ticker, setTicker] = useState("BTC")
  const [price, setPrice] = useState("")
  const [leverage, setLeverage] = useState(1)
  const [fee, setFee] = useState(0.04)

  useEffect(() => {
    fetch("/api/trades")
      .then(r => r.json())
      .then(setTrades)
      .catch(console.error)
  }, [])

  async function addTrade() {
    const res = await fetch("/api/trades", {
      method: "POST",
      body: JSON.stringify({
        ticker,
        direction: "LONG",
        entryPrice: Number(price),
        volume: 1,
        leverage,
        fee
      })
    })

    const data = await res.json()
    setTrades([...trades, data])
  }

  async function closeTrade(id: string) {
    const price = prompt("Exit price?")
    if (!price) return

    const res = await fetch("/api/trades/close", {
      method: "POST",
      body: JSON.stringify({
        id,
        exitPrice: Number(price)
      })
    })

    const updated = await res.json()

    setTrades(trades.map(t => (t.id === id ? updated : t)))
  }

  async function deleteTrade(id: string) {
    if (!confirm("Удалить сделку?")) return

    await fetch("/api/trades/delete", {
      method: "POST",
      body: JSON.stringify({ id })
    })

    setTrades(trades.filter(t => t.id !== id))
  }

  // ====================
  // 💰 РАСЧЕТЫ
  // ====================

  const initialDeposit = 1000

  const closedTrades = trades.filter(t => t.status === "CLOSED")

  let totalPnL = 0

  closedTrades.forEach((t: any) => {
    if (!t.exitPrice || !t.entryPrice) return

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

    totalPnL += rawPnL - feeCost
  })

  const balance = initialDeposit + totalPnL
  const roi = (totalPnL / initialDeposit) * 100

  // ====================
  // UI
  // ====================

  return (
    <div className="p-6 text-white bg-black min-h-screen">
      <h1 className="text-2xl mb-4">Crypto Journal</h1>

      {/* Форма */}
      <div className="grid grid-cols-5 gap-3 mb-6 items-end">
        <div>
          <label className="text-sm text-gray-400">Ticker</label>
          <input
            value={ticker}
            onChange={e => setTicker(e.target.value)}
            className="bg-gray-800 p-2 w-full"
          />
        </div>

        <div>
          <label className="text-sm text-gray-400">Entry Price</label>
          <input
            value={price}
            onChange={e => setPrice(e.target.value)}
            className="bg-gray-800 p-2 w-full"
          />
        </div>

        <div>
          <label className="text-sm text-gray-400">Leverage</label>
          <input
            type="number"
            value={leverage}
            onChange={e => setLeverage(Number(e.target.value))}
            className="bg-gray-800 p-2 w-full"
          />
        </div>

        <div>
          <label className="text-sm text-gray-400">Fee (%)</label>
          <input
            type="number"
            value={fee}
            onChange={e => setFee(Number(e.target.value))}
            className="bg-gray-800 p-2 w-full"
          />
        </div>

        <button onClick={addTrade} className="bg-blue-600 h-[42px]">
          Add
        </button>
      </div>

      {/* Статистика */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-[#111] p-4 rounded">
          <p>Balance</p>
          <p className="text-xl">{balance.toFixed(2)}$</p>
        </div>

        <div className="bg-[#111] p-4 rounded">
          <p>PnL</p>
          <p className={totalPnL >= 0 ? "text-green-400" : "text-red-400"}>
            {totalPnL.toFixed(2)}$
          </p>
        </div>

        <div className="bg-[#111] p-4 rounded">
          <p>ROI</p>
          <p className={roi >= 0 ? "text-green-400" : "text-red-400"}>
            {roi.toFixed(2)}%
          </p>
        </div>
      </div>

      {/* График */}
      <EquityChart trades={trades} />

      {/* Таблица */}
      <table className="w-full">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Entry</th>
            <th>Exit</th>
            <th>PnL</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>

        <tbody>
          {trades.map(t => {
            let pnl = 0

            if (t.exitPrice && t.entryPrice) {
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

              pnl = rawPnL - feeCost
            }

            return (
              <tr key={t.id}>
                <td>{t.ticker}</td>
                <td>{t.entryPrice}</td>
                <td>{t.exitPrice || "-"}</td>

                <td style={{ color: pnl > 0 ? "lime" : pnl < 0 ? "red" : "white" }}>
                  {t.exitPrice ? pnl.toFixed(2) : "-"}
                </td>

                <td>{t.status}</td>

                <td className="flex gap-2">
                  {t.status === "OPEN" && (
                    <button
                      onClick={() => closeTrade(t.id)}
                      className="bg-red-600 px-2"
                    >
                      Close
                    </button>
                  )}

                  <button
                    onClick={() => deleteTrade(t.id)}
                    className="bg-gray-700 px-2"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}