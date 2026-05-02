"use client"

import { useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { signOut } from "next-auth/react"
import { Direction, TradeStatus } from "@prisma/client"
import EquityChart, { type TradeWithLegs } from "@/components/EquityChart"
import { calculateTradePnL } from "@/lib/risk-manager"

const INITIAL_DEPOSIT = 1000

export default function DashboardPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [trades, setTrades] = useState<TradeWithLegs[]>([])
  const [symbol, setSymbol] = useState("BTCUSDT")
  const [direction, setDirection] = useState<Direction>(Direction.LONG)
  const [price, setPrice] = useState("")
  const [volume, setVolume] = useState("1")
  const [leverage, setLeverage] = useState("1")

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/trades")
      .then((r) => {
        if (r.status === 401) {
          router.push("/login")
          return []
        }
        return r.json()
      })
      .then((data) => {
        if (Array.isArray(data)) setTrades(data)
      })
      .catch(console.error)
  }, [status, router])

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Загрузка…
      </div>
    )
  }

  async function addTrade() {
    const res = await fetch("/api/trades", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: symbol.trim(),
        direction,
        price: Number(price),
        volume: Number(volume),
        leverage: Number(leverage) || undefined,
      }),
    })
    if (res.status === 401) {
      router.push("/login")
      return
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? "Ошибка создания сделки")
      return
    }
    const data: TradeWithLegs = await res.json()
    setTrades((prev) => [data, ...prev])
  }

  async function closeTrade(id: string) {
    const exitPrice = prompt("Цена выхода?")
    if (!exitPrice) return

    const res = await fetch("/api/trades/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        exitPrice: Number(exitPrice),
      }),
    })
    if (res.status === 401) {
      router.push("/login")
      return
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert(err.error ?? "Ошибка закрытия")
      return
    }
    const updated: TradeWithLegs = await res.json()
    setTrades((prev) => prev.map((t) => (t.id === id ? updated : t)))
  }

  async function deleteTrade(id: string) {
    if (!confirm("Удалить сделку?")) return

    const res = await fetch("/api/trades/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    })
    if (res.status === 401) {
      router.push("/login")
      return
    }
    if (!res.ok) return
    setTrades((prev) => prev.filter((t) => t.id !== id))
  }

  const closedTrades = trades.filter((t) => t.status === TradeStatus.CLOSED)
  let totalPnL = 0
  for (const t of closedTrades) {
    totalPnL += calculateTradePnL(t)
  }
  const balance = INITIAL_DEPOSIT + totalPnL
  const roi = (totalPnL / INITIAL_DEPOSIT) * 100
  const openCount = trades.filter((t) => t.status === TradeStatus.OPEN).length

  return (
    <div className="p-6 text-white bg-black min-h-screen">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-semibold">Crypto Journal</h1>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>{session?.user?.email}</span>
          <button
            type="button"
            onClick={() => signOut({ callbackUrl: "/login" })}
            className="rounded bg-gray-800 px-3 py-1.5 text-white hover:bg-gray-700"
          >
            Выйти
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6 items-end">
        <div>
          <label className="text-sm text-gray-400">Символ</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value)}
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">Направление</label>
          <select
            value={direction}
            onChange={(e) => setDirection(e.target.value as Direction)}
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
          >
            <option value={Direction.LONG}>Long</option>
            <option value={Direction.SHORT}>Short</option>
          </select>
        </div>
        <div>
          <label className="text-sm text-gray-400">Цена входа</label>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">Объём</label>
          <input
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">Плечо</label>
          <input
            type="number"
            min={1}
            value={leverage}
            onChange={(e) => setLeverage(e.target.value)}
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
          />
        </div>
        <button
          type="button"
          onClick={addTrade}
          className="bg-blue-600 h-[42px] rounded hover:bg-blue-700"
        >
          Добавить
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-[#111] p-4 rounded">
          <p className="text-gray-400 text-sm">Баланс (оценка)</p>
          <p className="text-xl">{balance.toFixed(2)} USDT</p>
        </div>
        <div className="bg-[#111] p-4 rounded">
          <p className="text-gray-400 text-sm">PnL (закрытые)</p>
          <p className={totalPnL >= 0 ? "text-xl text-green-400" : "text-xl text-red-400"}>
            {totalPnL.toFixed(2)} USDT
          </p>
        </div>
        <div className="bg-[#111] p-4 rounded">
          <p className="text-gray-400 text-sm">ROI / Открыто</p>
          <p className={roi >= 0 ? "text-xl text-green-400" : "text-xl text-red-400"}>
            {roi.toFixed(2)}% · открыто: {openCount}
          </p>
        </div>
      </div>

      <EquityChart trades={trades} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-2">Символ</th>
              <th className="py-2 pr-2">Напр.</th>
              <th className="py-2 pr-2">Вход (ср.)</th>
              <th className="py-2 pr-2">Выход (ср.)</th>
              <th className="py-2 pr-2">PnL</th>
              <th className="py-2 pr-2">Статус</th>
              <th className="py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((t) => {
              const entryVol = t.entries.reduce((s, e) => s + e.volume, 0)
              const exitVol = t.exits.reduce((s, e) => s + e.volume, 0)
              const avgEntry =
                entryVol > 0
                  ? t.entries.reduce((s, e) => s + e.price * e.volume, 0) / entryVol
                  : 0
              const avgExit =
                exitVol > 0 ? t.exits.reduce((s, e) => s + e.price * e.volume, 0) / exitVol : null

              let pnl = 0
              if (t.status === TradeStatus.CLOSED) {
                pnl = calculateTradePnL(t)
              }

              return (
                <tr key={t.id} className="border-b border-gray-900">
                  <td className="py-2 pr-2">{t.symbol}</td>
                  <td className="py-2 pr-2">{t.direction}</td>
                  <td className="py-2 pr-2">{avgEntry ? avgEntry.toFixed(4) : "—"}</td>
                  <td className="py-2 pr-2">
                    {avgExit != null ? avgExit.toFixed(4) : "—"}
                  </td>
                  <td
                    className={
                      pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : "text-gray-300"
                    }
                  >
                    {t.status === TradeStatus.CLOSED ? pnl.toFixed(2) : "—"}
                  </td>
                  <td className="py-2 pr-2">{t.status}</td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      {t.status === TradeStatus.OPEN && (
                        <button
                          type="button"
                          onClick={() => closeTrade(t.id)}
                          className="bg-red-600 px-2 py-1 rounded text-xs hover:bg-red-700"
                        >
                          Закрыть
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => deleteTrade(t.id)}
                        className="bg-gray-700 px-2 py-1 rounded text-xs hover:bg-gray-600"
                      >
                        Удалить
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
