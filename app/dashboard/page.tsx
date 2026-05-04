"use client"

import { Fragment, useEffect, useState } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ArrowDown, ArrowUp } from "lucide-react"
import { Direction, LiquidityRole, TradeStatus } from "@prisma/client"
import EquityChart, { type TradeWithLegs } from "@/components/EquityChart"
import { calculateRealizedPnL, calculateTradePnL, calculateVolumes } from "@/lib/risk-manager"
import { feeUsdtFromBps, notionalUsdt } from "@/lib/bingx-fees"
import { MAX_LEVERAGE_UI, TRADING_SYMBOL_SUGGESTIONS } from "@/lib/trading-symbols"
import { formatDecimal, formatInQuote, formatPercent } from "@/lib/format-amount"
import { quoteCurrencyFromSymbol } from "@/lib/quote-currency"

const INITIAL_DEPOSIT = 1000

type TradingDefaults = {
  defaultFeeUsdt: number
  makerFeeBps: number
  takerFeeBps: number
  maxLeverage: number
}

export default function DashboardPage() {
  const { status } = useSession()
  const router = useRouter()
  const [trades, setTrades] = useState<TradeWithLegs[]>([])
  const [symbol, setSymbol] = useState("BTCUSDT")
  const [direction, setDirection] = useState<Direction>(Direction.LONG)
  const [price, setPrice] = useState("")
  const [volume, setVolume] = useState("1")
  const [leverage, setLeverage] = useState(10)
  const [strategy, setStrategy] = useState("")
  const [emotionEntry, setEmotionEntry] = useState("")
  const [fee, setFee] = useState("")
  const [funding, setFunding] = useState("0")
  const [tradingDefaults, setTradingDefaults] = useState<TradingDefaults>({
    defaultFeeUsdt: 0,
    makerFeeBps: 2,
    takerFeeBps: 5,
    maxLeverage: MAX_LEVERAGE_UI,
  })
  const [entryLiquidity, setEntryLiquidity] = useState<LiquidityRole>(LiquidityRole.TAKER)
  const [exitLiquidityById, setExitLiquidityById] = useState<Record<string, LiquidityRole>>({})
  const [exitPriceById, setExitPriceById] = useState<Record<string, string>>({})
  const [exitVolumeById, setExitVolumeById] = useState<Record<string, string>>({})
  const [emotionExitById, setEmotionExitById] = useState<Record<string, string>>({})
  const [feeById, setFeeById] = useState<Record<string, string>>({})
  const [fundingById, setFundingById] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    if (status !== "authenticated") return
    fetch("/api/settings/trading", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TradingDefaults | null) => {
        if (!data) return
        setTradingDefaults({
          defaultFeeUsdt: Number(data.defaultFeeUsdt) || 0,
          makerFeeBps: Number(data.makerFeeBps) || 2,
          takerFeeBps: Number(data.takerFeeBps) || 5,
          maxLeverage: Number(data.maxLeverage) || MAX_LEVERAGE_UI,
        })
      })
      .catch(console.error)
  }, [status])

  /** Не подменяем список на [] при HTML/ошибке — иначе UI «теряет» открытые сделки. */
  async function loadTrades(): Promise<boolean> {
    const r = await fetch("/api/trades", { cache: "no-store", credentials: "include" })
    if (r.status === 401) {
      router.push("/login")
      return false
    }
    if (!r.ok) return false
    const ct = r.headers.get("content-type") ?? ""
    if (!ct.includes("application/json")) return false
    const data = await r.json().catch(() => null)
    if (!Array.isArray(data)) return false
    setTrades(data)
    return true
  }

  useEffect(() => {
    if (status !== "authenticated") return
    void loadTrades()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, router])

  useEffect(() => {
    setLeverage((l) =>
      Math.min(Math.max(1, l), tradingDefaults.maxLeverage || MAX_LEVERAGE_UI),
    )
  }, [tradingDefaults.maxLeverage])

  if (status === "loading") {
    return (
      <div className="flex items-center justify-center min-h-screen text-gray-400">
        Загрузка…
      </div>
    )
  }

  async function addTrade() {
    const p = Number(price)
    const v = Number(volume)
    if (!Number.isFinite(p) || p <= 0) {
      alert("Укажи цену входа больше 0")
      return
    }
    if (!Number.isFinite(v) || v <= 0) {
      alert("Укажи маржу больше 0")
      return
    }

    const openBody: Record<string, unknown> = {
      symbol: symbol.trim(),
      direction: direction === Direction.LONG ? "LONG" : "SHORT",
      price: p,
      volume: v,
      leverage: Number.isFinite(leverage) ? leverage : undefined,
      strategy: strategy.trim() || undefined,
      emotionEntry: emotionEntry.trim() || undefined,
      liquidityRole: entryLiquidity === LiquidityRole.MAKER ? "MAKER" : "TAKER",
    }
    if (fee !== "") openBody.fee = Number(fee)
    if (funding !== "") openBody.funding = Number(funding)

    const res = await fetch("/api/trades", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "include",
      body: JSON.stringify(openBody),
    })
    if (res.status === 401) {
      router.push("/login")
      return
    }
    const ct = res.headers.get("content-type") ?? ""
    if (!ct.includes("application/json")) {
      alert(`Сервер вернул не JSON (код ${res.status}). Обнови страницу и войди снова.`)
      return
    }
    const payload = (await res.json().catch(() => null)) as { error?: string } & TradeWithLegs | null
    if (!res.ok) {
      const detail =
        payload && typeof payload === "object" && "error" in payload
          ? String((payload as { error?: unknown }).error ?? "")
          : ""
      alert(detail || `Ошибка создания сделки (HTTP ${res.status})`)
      return
    }
    const created = payload as TradeWithLegs | null
    if (!created?.id) {
      alert("Сервер вернул ответ без id сделки. Смотри терминал dev-сервера (логи Prisma).")
      void loadTrades()
      setPrice("")
      return
    }
    setTrades((prev) => {
      const idx = prev.findIndex((t) => t.id === created.id)
      if (idx === -1) return [created, ...prev]
      const copy = prev.slice()
      copy[idx] = created
      return copy
    })
    await loadTrades()
    setPrice("")
  }

  async function closeTrade(id: string) {
    const exitPrice = exitPriceById[id] ?? ""
    if (!exitPrice) {
      alert("Укажи цену выхода")
      return
    }

    const exitVolumeRaw = exitVolumeById[id]
    const feeRaw = feeById[id]
    const payload: Record<string, unknown> = {
      id,
      exitPrice: Number(exitPrice),
      emotionExit: (emotionExitById[id] ?? "").trim() || undefined,
      liquidityRole:
        (exitLiquidityById[id] ?? LiquidityRole.TAKER) === LiquidityRole.MAKER ? "MAKER" : "TAKER",
      funding:
        fundingById[id] !== "" && fundingById[id] != null ? Number(fundingById[id]) : undefined,
    }
    if (feeRaw !== undefined && feeRaw !== "") {
      const n = Number(feeRaw)
      if (Number.isFinite(n) && n >= 0) payload.fee = n
    }
    if (exitVolumeRaw != null && exitVolumeRaw !== "") {
      payload.exitVolume = Number(exitVolumeRaw)
    }

    const res = await fetch("/api/trades/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
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
    void loadTrades()
    setExitPriceById((prev) => ({ ...prev, [id]: "" }))
    setExitVolumeById((prev) => ({ ...prev, [id]: "" }))
    setEmotionExitById((prev) => ({ ...prev, [id]: "" }))
    setFeeById((prev) => {
      const next = { ...prev, [id]: "" }
      delete next[id]
      return next
    })
    setFundingById((prev) => {
      const next = { ...prev, [id]: "" }
      delete next[id]
      return next
    })
  }

  function setExitVolumeFraction(tradeId: string, remaining: number, fraction: number) {
    if (remaining <= 0 || !Number.isFinite(fraction)) return
    const v = Math.min(remaining, Math.max(0, remaining * fraction))
    const rounded = Math.round(v * 1e6) / 1e6
    setExitVolumeById((prev) => ({ ...prev, [tradeId]: String(rounded) }))
  }

  async function deleteTrade(id: string) {
    if (!confirm("Удалить трейд в корзину? Восстановление — в разделе «Корзина».")) return

    const res = await fetch("/api/trades/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ id }),
    })
    if (res.status === 401) {
      router.push("/login")
      return
    }
    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      alert((err as { error?: string }).error ?? "Не удалось удалить")
      return
    }
    setTrades((prev) => prev.filter((t) => t.id !== id))
    void loadTrades()
  }

  const closedTrades = trades.filter((t) => t.status === TradeStatus.CLOSED)
  let totalPnL = 0
  for (const t of closedTrades) {
    totalPnL += calculateTradePnL(t)
  }
  const balance = INITIAL_DEPOSIT + totalPnL
  const roi = (totalPnL / INITIAL_DEPOSIT) * 100
  const openTrades = trades.filter((t) => t.status === TradeStatus.OPEN)
  const openCount = openTrades.length

  const entryNotional =
    Number.isFinite(Number(price)) && Number.isFinite(Number(volume)) && Number(volume) > 0
      ? notionalUsdt(Number(price), Number(volume))
      : 0
  const suggestedEntryFee = feeUsdtFromBps(
    entryNotional,
    entryLiquidity,
    tradingDefaults.makerFeeBps,
    tradingDefaults.takerFeeBps,
  )

  const feeQuote = quoteCurrencyFromSymbol(symbol)
  const feeHintTitle = `Комиссия: номинал (цена × маржа) × bps / 10 000. Сейчас ≈ ${formatDecimal(suggestedEntryFee)} ${feeQuote} при выбранном Maker/Taker. Пустое поле ниже — авто.`

  return (
    <div className="p-6 text-white bg-black min-h-screen">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6 items-end">
        <div>
          <label className="text-sm text-gray-400">Символ</label>
          <input
            value={symbol}
            onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            list="cj-symbol-suggestions"
            autoComplete="off"
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
          />
          <datalist id="cj-symbol-suggestions">
            {TRADING_SYMBOL_SUGGESTIONS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </div>
        <div>
          <label className="text-sm text-gray-400">Направление</label>
          <div className="flex gap-2 mt-1">
            <button
              type="button"
              onClick={() => setDirection(Direction.LONG)}
              className={`flex flex-1 items-center justify-center gap-1 rounded border px-2 py-2 text-sm font-medium transition-colors ${
                direction === Direction.LONG
                  ? "border-green-500 bg-green-600/30 text-green-300"
                  : "border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-800/80"
              }`}
              aria-pressed={direction === Direction.LONG}
            >
              <ArrowUp className="h-4 w-4" aria-hidden />
              Long
            </button>
            <button
              type="button"
              onClick={() => setDirection(Direction.SHORT)}
              className={`flex flex-1 items-center justify-center gap-1 rounded border px-2 py-2 text-sm font-medium transition-colors ${
                direction === Direction.SHORT
                  ? "border-red-500 bg-red-600/30 text-red-300"
                  : "border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-800/80"
              }`}
              aria-pressed={direction === Direction.SHORT}
            >
              <ArrowDown className="h-4 w-4" aria-hidden />
              Short
            </button>
          </div>
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
          <label className="text-sm text-gray-400">Маржа</label>
          <input
            value={volume}
            onChange={(e) => setVolume(e.target.value)}
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
          />
        </div>
        <div className="min-w-[140px]">
          <label className="text-sm text-gray-400">
            Плечо{" "}
            <span className="text-gray-200">
              {Math.min(leverage, tradingDefaults.maxLeverage)}×
            </span>
          </label>
          <input
            type="range"
            min={1}
            max={tradingDefaults.maxLeverage}
            value={Math.min(leverage, tradingDefaults.maxLeverage)}
            onChange={(e) => setLeverage(Number(e.target.value))}
            className="mt-2 w-full accent-blue-600"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="text-sm text-gray-400">Стратегия входа</label>
          <input
            value={strategy}
            onChange={(e) => setStrategy(e.target.value)}
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
            placeholder="Напр. breakout / mean reversion"
          />
        </div>
        <div className="lg:col-span-2">
          <label className="text-sm text-gray-400">Эмоции при открытии</label>
          <input
            value={emotionEntry}
            onChange={(e) => setEmotionEntry(e.target.value)}
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
            placeholder="Спокойствие / FOMO / страх и т.п."
          />
        </div>
        <div className="lg:col-span-2">
          <div className="flex items-center gap-1.5">
            <label className="text-sm text-gray-400">Комиссия входа (BingX)</label>
            <button
              type="button"
              className="inline-flex h-5 w-5 shrink-0 cursor-help items-center justify-center rounded-full border border-gray-600 text-[11px] font-medium text-gray-400 hover:border-gray-500 hover:bg-gray-800/80"
              title={feeHintTitle}
              aria-label={feeHintTitle}
            >
              ?
            </button>
          </div>
          <div className="mt-1 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEntryLiquidity(LiquidityRole.MAKER)}
              className={`rounded px-2 py-1 text-xs ${
                entryLiquidity === LiquidityRole.MAKER
                  ? "bg-blue-700 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              Maker {tradingDefaults.makerFeeBps} bps
            </button>
            <button
              type="button"
              onClick={() => setEntryLiquidity(LiquidityRole.TAKER)}
              className={`rounded px-2 py-1 text-xs ${
                entryLiquidity === LiquidityRole.TAKER
                  ? "bg-blue-700 text-white"
                  : "bg-gray-800 text-gray-400"
              }`}
            >
              Taker {tradingDefaults.takerFeeBps} bps
            </button>
          </div>
          <input
            value={fee}
            onChange={(e) => setFee(e.target.value)}
            className="mt-1 bg-gray-800 p-2 w-full rounded border border-gray-700"
            placeholder="авто по maker/taker"
          />
        </div>
        <div>
          <label className="text-sm text-gray-400">Фандинг</label>
          <input
            value={funding}
            onChange={(e) => setFunding(e.target.value)}
            className="bg-gray-800 p-2 w-full rounded border border-gray-700"
            placeholder="0"
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

      <EquityChart trades={trades} />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800 text-left text-gray-400">
              <th className="py-2 pr-2">Символ</th>
              <th className="py-2 pr-2">Напр.</th>
              <th className="py-2 pr-2">Маржа</th>
              <th className="py-2 pr-2">Осталось</th>
              <th className="py-2 pr-2">Плечо</th>
              <th className="py-2 pr-2">Вход (ср.)</th>
              <th className="py-2 pr-2">Выход (ср.)</th>
              <th className="py-2 pr-2">PnL (реал.)</th>
              <th className="py-2 pr-2">Статус</th>
              <th className="py-2">Действия</th>
            </tr>
          </thead>
          <tbody>
            {openTrades.map((t) => {
              const q = quoteCurrencyFromSymbol(t.symbol)
              const { entryVolume: entryVol, exitVolume: exitVol, remainingVolume } =
                calculateVolumes(t)
              const maxLeverage = t.entries.reduce((m, e) => Math.max(m, e.leverage ?? 0), 0)
              const avgEntry =
                entryVol > 0
                  ? t.entries.reduce((s, e) => s + e.price * e.volume, 0) / entryVol
                  : 0
              const avgExit =
                exitVol > 0 ? t.exits.reduce((s, e) => s + e.price * e.volume, 0) / exitVol : null

              const realized = calculateRealizedPnL(t)
              const full = t.status === TradeStatus.CLOSED ? calculateTradePnL(t) : 0
              const displayPnl = t.status === TradeStatus.CLOSED ? full : realized

              return (
                <Fragment key={t.id}>
                  <tr className="border-b border-gray-900">
                    <td className="py-2 pr-2">{t.symbol}</td>
                    <td className="py-2 pr-2">{t.direction}</td>
                    <td className="py-2 pr-2">{entryVol ? formatInQuote(entryVol, q) : "—"}</td>
                    <td className="py-2 pr-2">
                      {remainingVolume > 0 ? formatInQuote(remainingVolume, q) : `0 ${q}`}
                    </td>
                    <td className="py-2 pr-2">{maxLeverage ? `${maxLeverage}x` : "—"}</td>
                    <td className="py-2 pr-2">{avgEntry ? formatDecimal(avgEntry) : "—"}</td>
                    <td className="py-2 pr-2">{avgExit != null ? formatDecimal(avgExit) : "—"}</td>
                    <td
                      className={
                        displayPnl > 0
                          ? "text-green-400"
                          : displayPnl < 0
                            ? "text-red-400"
                            : "text-gray-300"
                      }
                    >
                      {exitVol > 0 ? formatInQuote(displayPnl, q) : "—"}
                    </td>
                    <td className="py-2 pr-2">{t.status}</td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setExpanded((p) => ({ ...p, [t.id]: !(p[t.id] ?? false) }))
                          }
                          className="bg-gray-800 px-2 py-1 rounded text-xs hover:bg-gray-700"
                        >
                          {expanded[t.id] ? "Скрыть" : "Детали"}
                        </button>
                        {t.status === TradeStatus.OPEN && (
                          <>
                            <input
                              value={exitPriceById[t.id] ?? ""}
                              onChange={(e) =>
                                setExitPriceById((prev) => ({ ...prev, [t.id]: e.target.value }))
                              }
                              placeholder="Цена выхода"
                              className="bg-gray-800 px-2 py-1 rounded border border-gray-700 text-xs w-28"
                            />
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() =>
                                  setExitLiquidityById((p) => ({
                                    ...p,
                                    [t.id]: LiquidityRole.MAKER,
                                  }))
                                }
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  (exitLiquidityById[t.id] ?? LiquidityRole.TAKER) ===
                                  LiquidityRole.MAKER
                                    ? "bg-blue-700"
                                    : "bg-gray-700"
                                }`}
                              >
                                M
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setExitLiquidityById((p) => ({
                                    ...p,
                                    [t.id]: LiquidityRole.TAKER,
                                  }))
                                }
                                className={`rounded px-1.5 py-0.5 text-[10px] ${
                                  (exitLiquidityById[t.id] ?? LiquidityRole.TAKER) ===
                                  LiquidityRole.TAKER
                                    ? "bg-blue-700"
                                    : "bg-gray-700"
                                }`}
                              >
                                T
                              </button>
                            </div>
                            <div className="flex flex-col gap-1">
                              <input
                                value={exitVolumeById[t.id] ?? ""}
                                onChange={(e) =>
                                  setExitVolumeById((prev) => ({ ...prev, [t.id]: e.target.value }))
                                }
                                placeholder={`Маржа (макс. ${formatDecimal(remainingVolume)} ${q})`}
                                className="bg-gray-800 px-2 py-1 rounded border border-gray-700 text-xs w-32"
                              />
                              {remainingVolume > 0 && (
                                <div className="flex flex-wrap gap-1">
                                  {[
                                    ["25%", 0.25],
                                    ["50%", 0.5],
                                    ["75%", 0.75],
                                    ["100%", 1],
                                  ].map(([label, frac]) => (
                                    <button
                                      key={label}
                                      type="button"
                                      onClick={() =>
                                        setExitVolumeFraction(
                                          t.id,
                                          remainingVolume,
                                          frac as number,
                                        )
                                      }
                                      className="rounded bg-gray-700 px-1.5 py-0.5 text-[10px] hover:bg-gray-600"
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                            <input
                              value={emotionExitById[t.id] ?? ""}
                              onChange={(e) =>
                                setEmotionExitById((prev) => ({ ...prev, [t.id]: e.target.value }))
                              }
                              placeholder="Эмоции выхода"
                              className="bg-gray-800 px-2 py-1 rounded border border-gray-700 text-xs w-36"
                            />
                            <input
                              value={feeById[t.id] ?? ""}
                              onChange={(e) =>
                                setFeeById((prev) => ({ ...prev, [t.id]: e.target.value }))
                              }
                              placeholder="комис. авто"
                              className="bg-gray-800 px-2 py-1 rounded border border-gray-700 text-xs w-24"
                            />
                            <input
                              value={fundingById[t.id] ?? ""}
                              onChange={(e) =>
                                setFundingById((prev) => ({ ...prev, [t.id]: e.target.value }))
                              }
                              placeholder="Фандинг"
                              className="bg-gray-800 px-2 py-1 rounded border border-gray-700 text-xs w-24"
                            />
                            <button
                              type="button"
                              onClick={() => closeTrade(t.id)}
                              className="bg-red-600 px-2 py-1 rounded text-xs hover:bg-red-700"
                            >
                              Закрыть
                            </button>
                          </>
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
                  {expanded[t.id] && (
                    <tr className="border-b border-gray-900 bg-[#0b0b0b]">
                      <td colSpan={10} className="py-3">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                          <div>
                            <div className="text-gray-400 text-xs mb-2">Входы</div>
                            <div className="space-y-1 text-xs">
                              {t.entries
                                .slice()
                                .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                .map((e) => (
                                  <div key={e.id} className="flex justify-between gap-3">
                                    <span className="text-gray-400">
                                      {new Date(e.timestamp).toLocaleString()}
                                    </span>
                                    <span>цена: {formatDecimal(e.price)}</span>
                                    <span>маржа: {formatInQuote(e.volume, q)}</span>
                                    <span>lev: {e.leverage ?? "—"}</span>
                                    <span>
                                      fee:{" "}
                                      {e.fee != null ? formatInQuote(Number(e.fee), q) : "—"}
                                    </span>
                                    <span>{e.liquidityRole}</span>
                                  </div>
                                ))}
                            </div>
                          </div>
                          <div>
                            <div className="text-gray-400 text-xs mb-2">Выходы</div>
                            <div className="space-y-1 text-xs">
                              {t.exits.length === 0 ? (
                                <div className="text-gray-500">Нет выходов</div>
                              ) : (
                                t.exits
                                  .slice()
                                  .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                                  .map((x) => (
                                    <div
                                      key={x.id}
                                      className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-gray-200"
                                    >
                                      <span className="text-gray-400">
                                        {new Date(x.timestamp).toLocaleString()}
                                      </span>
                                      <span>{formatDecimal(x.price)}</span>
                                      <span>{formatInQuote(x.volume, q)}</span>
                                      <span>
                                        fee{" "}
                                        {x.fee != null ? formatInQuote(Number(x.fee), q) : "—"}
                                      </span>
                                      <span>
                                        fnd{" "}
                                        {x.funding != null
                                          ? formatInQuote(Number(x.funding), q)
                                          : "—"}
                                      </span>
                                      <span>{x.liquidityRole}</span>
                                      <span className="text-gray-300">
                                        эмоц.: {x.emotionExit ?? "—"}
                                      </span>
                                    </div>
                                  ))
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 text-xs text-gray-400">
                          strategy: <span className="text-gray-200">{t.strategy ?? "—"}</span>{" "}
                          · emotion entry:{" "}
                          <span className="text-gray-200">{t.emotionEntry ?? "—"}</span>{" "}
                          · emotion exit:{" "}
                          <span className="text-gray-200">{t.emotionExit ?? "—"}</span>{" "}
                          · fee:{" "}
                          <span className="text-gray-200">
                            {t.fee != null ? formatInQuote(Number(t.fee), q) : "—"}
                          </span>{" "}
                          · funding:{" "}
                          <span className="text-gray-200">
                            {t.funding != null ? formatInQuote(Number(t.funding), q) : "—"}
                          </span>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

