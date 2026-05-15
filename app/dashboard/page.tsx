"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import EquityChart from "@/components/EquityChart"
import { MAX_LEVERAGE_UI } from "@/lib/trading-symbols"
import { getEmotions, getStrategies } from "@/features/settings/api"
import type { JournalRiskSummaryDto } from "@/contracts/risk"
import { patchTradeStopLoss, postRiskEvaluate } from "@/features/risk/api"
import { getTradingDefaults, postCloseTrade, postDeleteTrade, postOpenTrade } from "@/features/trades/api"
import { useActiveAccount } from "@/features/trades/active-account-context"
import { OpenTradesTable } from "@/features/trades/components/open-trades-table"
import {
  DashboardAveragingPanelStage26,
  DashboardDayStripStage26,
} from "@/features/trades/components/dashboard-widgets-stage26"
import { DashboardSummaryCards } from "@/features/trades/components/dashboard-summary-cards"
import { TradeOpenForm, type Liquidity } from "@/features/trades/components/trade-open-form"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import { useTradesJournal } from "@/features/trades/hooks/use-trades-journal"
import { redirectOn401 } from "@/features/trades/session-expired"

type TradingDefaults = {
  defaultFeeUsdt: number
  makerFeeBps: number
  takerFeeBps: number
  maxLeverage: number
}

export default function DashboardPage() {
  const router = useRouter()
  const gate = useProtectedPageSession()
  const authed = gate === "authed"
  const {
    ready: accountReady,
    journalAllAccounts,
    resolvedActiveAccountId,
    activeAccountId,
  } = useActiveAccount()

  const [dashWidgetsNonce, setDashWidgetsNonce] = useState(0)

  const tradeAccountId = activeAccountId ?? resolvedActiveAccountId

  const listQuery = useMemo(() => {
    if (journalAllAccounts) return undefined
    if (!resolvedActiveAccountId) return undefined
    return { accountId: resolvedActiveAccountId }
  }, [journalAllAccounts, resolvedActiveAccountId])

  const { trades, setTrades, summary, refresh } = useTradesJournal(
    authed && accountReady,
    listQuery,
  )

  const [liveRisk, setLiveRisk] = useState<JournalRiskSummaryDto | null>(null)
  const riskEvalSeq = useRef(0)

  useEffect(() => {
    setLiveRisk(summary?.risk ?? null)
  }, [summary])

  const applyMarkPricesForRisk = useCallback(
    async (markPricesByTradeId: Record<string, number>) => {
      if (!authed || !accountReady) return
      const seq = ++riskEvalSeq.current
      const r = await postRiskEvaluate({
        ...(Object.keys(markPricesByTradeId).length > 0 ? { markPricesByTradeId } : {}),
        ...(journalAllAccounts || !resolvedActiveAccountId
          ? {}
          : { accountId: resolvedActiveAccountId }),
      })
      if (seq !== riskEvalSeq.current) return
      if (!r.ok) {
        redirectOn401(router, r.status)
        return
      }
      setLiveRisk(r.data.summary)
      setTrades((prev) =>
        prev.map((t) => {
          const row = r.data.openTrades.find((x) => x.tradeId === t.id)
          return row ? { ...t, risk: row.risk } : t
        }),
      )
    },
    [
      authed,
      accountReady,
      journalAllAccounts,
      resolvedActiveAccountId,
      router,
      setTrades,
    ],
  )

  const [symbol, setSymbol] = useState("BTCUSDT")
  const [direction, setDirection] = useState<"LONG" | "SHORT">("LONG")
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
  const [displayTimeZone, setDisplayTimeZone] = useState<string | null>(null)
  const [strategyNames, setStrategyNames] = useState<string[]>([])
  const [emotionNames, setEmotionNames] = useState<string[]>([])
  const [entryLiquidity, setEntryLiquidity] = useState<Liquidity>("TAKER")
  const [exitLiquidityById, setExitLiquidityById] = useState<Record<string, Liquidity>>({})
  const [exitPriceById, setExitPriceById] = useState<Record<string, string>>({})
  const [exitVolumeById, setExitVolumeById] = useState<Record<string, string>>({})
  const [emotionExitById, setEmotionExitById] = useState<Record<string, string>>({})
  const [feeById, setFeeById] = useState<Record<string, string>>({})
  const [fundingById, setFundingById] = useState<Record<string, string>>({})
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const [stopLoss, setStopLoss] = useState("")

  useEffect(() => {
    if (!authed) return
    void getTradingDefaults().then((r) => {
      if (!r.ok) return
      const d = r.data
      setTradingDefaults({
        defaultFeeUsdt: Number(d.defaultFeeUsdt) || 0,
        makerFeeBps: Number(d.makerFeeBps) || 2,
        takerFeeBps: Number(d.takerFeeBps) || 5,
        maxLeverage: Number(d.maxLeverage) || MAX_LEVERAGE_UI,
      })
      setDisplayTimeZone((d.displayTimeZone && String(d.displayTimeZone).trim()) || "UTC")
    })
  }, [authed])

  useEffect(() => {
    if (!authed || !accountReady) return
    void getStrategies().then((r) => {
      if (r.ok) setStrategyNames(r.data.strategies.map((s) => s.name))
    })
    void getEmotions().then((r) => {
      if (r.ok) setEmotionNames(r.data.emotions.map((e) => e.name))
    })
  }, [authed, accountReady])

  useEffect(() => {
    setLeverage((l) =>
      Math.min(Math.max(1, l), tradingDefaults.maxLeverage || MAX_LEVERAGE_UI),
    )
  }, [tradingDefaults.maxLeverage])

  if (gate === "loading") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--text-secondary)]">
        Загрузка…
      </div>
    )
  }
  if (gate === "guest") {
    return null
  }

  if (!accountReady || !tradeAccountId) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--text-secondary)]">
        Подготовка счёта…
      </div>
    )
  }

  const balance = summary?.balanceEstimateUsdt ?? 0
  const totalPnL = summary?.totalPnlClosedUsdt ?? 0
  const roi = summary?.roiPercent ?? 0
  const openTrades = trades.filter((t) => t.status === "OPEN")
  const openCount = summary?.openCount ?? openTrades.length

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
      accountId: tradeAccountId,
      symbol: symbol.trim(),
      direction,
      price: p,
      volume: v,
      leverage: Number.isFinite(leverage) ? leverage : undefined,
      strategy: strategy.trim() || undefined,
      emotionEntry: emotionEntry.trim() || undefined,
      liquidityRole: entryLiquidity,
    }
    if (fee !== "") openBody.fee = Number(fee)
    if (funding !== "") openBody.funding = Number(funding)
    const sl = Number(stopLoss)
    if (Number.isFinite(sl) && sl > 0) openBody.stopLossPrice = sl

    const res = await postOpenTrade(openBody)
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) alert(res.error || "Ошибка создания сделки")
      return
    }
    const created = res.data.trade
    if (!created?.id) {
      alert("Сервер вернул ответ без id сделки.")
      void refresh()
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
    await refresh()
    setDashWidgetsNonce((n) => n + 1)
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
      liquidityRole: exitLiquidityById[id] ?? "TAKER",
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

    const res = await postCloseTrade(payload)
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) alert(res.error || "Ошибка закрытия")
      return
    }
    const updated = res.data.trade
    setTrades((prev) => prev.map((t) => (t.id === id ? updated : t)))
    void refresh().then(() => setDashWidgetsNonce((n) => n + 1))
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

  async function saveStopLoss(tradeId: string, raw: string) {
    const trimmed = raw.trim()
    const stopLossPrice =
      trimmed === "" ? null : Number.isFinite(Number(trimmed)) && Number(trimmed) > 0
        ? Number(trimmed)
        : null
    if (trimmed !== "" && stopLossPrice == null) {
      alert("Стоп должен быть числом > 0")
      return
    }
    const r = await patchTradeStopLoss(tradeId, stopLossPrice)
    if (!r.ok) {
      redirectOn401(router, r.status)
      if (r.status !== 401) alert(r.error || "Ошибка")
      return
    }
    setTrades((prev) => prev.map((t) => (t.id === tradeId ? r.data.trade : t)))
    void refresh()
  }

  async function deleteTrade(id: string) {
    if (!confirm("Удалить трейд в корзину? Восстановление — Настройки → Корзина.")) return

    const res = await postDeleteTrade({ id })
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) alert(res.error || "Не удалось удалить")
      return
    }
    setTrades((prev) => prev.filter((t) => t.id !== id))
    void refresh().then(() => setDashWidgetsNonce((n) => n + 1))
  }

  return (
    <div className="text-[var(--text-primary)]">
      <TradeOpenForm
        symbol={symbol}
        setSymbol={setSymbol}
        direction={direction}
        setDirection={setDirection}
        price={price}
        setPrice={setPrice}
        volume={volume}
        setVolume={setVolume}
        leverage={leverage}
        setLeverage={setLeverage}
        strategy={strategy}
        setStrategy={setStrategy}
        emotionEntry={emotionEntry}
        setEmotionEntry={setEmotionEntry}
        fee={fee}
        setFee={setFee}
        funding={funding}
        setFunding={setFunding}
        entryLiquidity={entryLiquidity}
        setEntryLiquidity={setEntryLiquidity}
        tradingDefaults={tradingDefaults}
        strategyOptions={strategyNames}
        emotionOptions={emotionNames}
        stopLoss={stopLoss}
        setStopLoss={setStopLoss}
        formInstanceId="dashboard"
        onSubmit={addTrade}
      />

      <DashboardSummaryCards
        balance={balance}
        totalPnL={totalPnL}
        roi={roi}
        openCount={openCount}
        risk={liveRisk}
      />

      <DashboardDayStripStage26
        authed={authed}
        accountReady={accountReady}
        journalAllAccounts={journalAllAccounts}
        journalAccountId={resolvedActiveAccountId ?? undefined}
        displayTimeZone={displayTimeZone}
        refreshNonce={dashWidgetsNonce}
      />

      <OpenTradesTable
        openTrades={openTrades}
        expanded={expanded}
        setExpanded={setExpanded}
        exitPriceById={exitPriceById}
        setExitPriceById={setExitPriceById}
        exitLiquidityById={exitLiquidityById}
        setExitLiquidityById={setExitLiquidityById}
        exitVolumeById={exitVolumeById}
        setExitVolumeById={setExitVolumeById}
        emotionExitById={emotionExitById}
        setEmotionExitById={setEmotionExitById}
        feeById={feeById}
        setFeeById={setFeeById}
        fundingById={fundingById}
        setFundingById={setFundingById}
        closeTrade={closeTrade}
        deleteTrade={deleteTrade}
        setExitVolumeFraction={setExitVolumeFraction}
        emotionExitOptions={emotionNames}
        onSaveStopLoss={saveStopLoss}
      />

      <EquityChart equityCurve={summary?.equityCurve ?? []} />

      <DashboardAveragingPanelStage26
        authed={authed}
        accountReady={accountReady}
        journalAllAccounts={journalAllAccounts}
        journalAccountId={resolvedActiveAccountId ?? undefined}
        refreshNonce={dashWidgetsNonce}
        onMarkPricesChange={applyMarkPricesForRisk}
      />
    </div>
  )
}
