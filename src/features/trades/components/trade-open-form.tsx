"use client"

import { type Dispatch, type SetStateAction } from "react"
import { ArrowDown, ArrowUp } from "lucide-react"
import { feeUsdtFromBps, notionalUsdt } from "@/lib/bingx-fees"
import { TRADING_SYMBOL_SUGGESTIONS } from "@/lib/trading-symbols"
import { formatDecimal } from "@/lib/format-amount"
import { quoteCurrencyFromSymbol } from "@/lib/quote-currency"

export type Liquidity = "MAKER" | "TAKER"

export type TradeOpenFormDefaults = {
  makerFeeBps: number
  takerFeeBps: number
  maxLeverage: number
}

type Props = {
  symbol: string
  setSymbol: Dispatch<SetStateAction<string>>
  direction: "LONG" | "SHORT"
  setDirection: Dispatch<SetStateAction<"LONG" | "SHORT">>
  price: string
  setPrice: Dispatch<SetStateAction<string>>
  volume: string
  setVolume: Dispatch<SetStateAction<string>>
  leverage: number
  setLeverage: Dispatch<SetStateAction<number>>
  strategy: string
  setStrategy: Dispatch<SetStateAction<string>>
  emotionEntry: string
  setEmotionEntry: Dispatch<SetStateAction<string>>
  fee: string
  setFee: Dispatch<SetStateAction<string>>
  funding: string
  setFunding: Dispatch<SetStateAction<string>>
  entryLiquidity: Liquidity
  setEntryLiquidity: Dispatch<SetStateAction<Liquidity>>
  tradingDefaults: TradeOpenFormDefaults
  /** Имена из справочника (Настройки → стратегии / эмоции) */
  strategyOptions?: string[]
  emotionOptions?: string[]
  formInstanceId?: string
  onSubmit: () => void
}

export function TradeOpenForm({
  symbol,
  setSymbol,
  direction,
  setDirection,
  price,
  setPrice,
  volume,
  setVolume,
  leverage,
  setLeverage,
  strategy,
  setStrategy,
  emotionEntry,
  setEmotionEntry,
  fee,
  setFee,
  funding,
  setFunding,
  entryLiquidity,
  setEntryLiquidity,
  tradingDefaults,
  strategyOptions = [],
  emotionOptions = [],
  formInstanceId = "main",
  onSubmit,
}: Props) {
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
            onClick={() => setDirection("LONG")}
            className={`flex flex-1 items-center justify-center gap-1 rounded border px-2 py-2 text-sm font-medium transition-colors ${
              direction === "LONG"
                ? "border-green-500 bg-green-600/30 text-green-300"
                : "border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-800/80"
            }`}
            aria-pressed={direction === "LONG"}
          >
            <ArrowUp className="h-4 w-4" aria-hidden />
            Long
          </button>
          <button
            type="button"
            onClick={() => setDirection("SHORT")}
            className={`flex flex-1 items-center justify-center gap-1 rounded border px-2 py-2 text-sm font-medium transition-colors ${
              direction === "SHORT"
                ? "border-red-500 bg-red-600/30 text-red-300"
                : "border-gray-700 bg-gray-800 text-gray-400 hover:bg-gray-800/80"
            }`}
            aria-pressed={direction === "SHORT"}
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
          list={`cj-strategy-${formInstanceId}`}
          autoComplete="off"
          className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2"
          placeholder="Из списка или свой текст"
        />
        <datalist id={`cj-strategy-${formInstanceId}`}>
          {strategyOptions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </div>
      <div className="lg:col-span-2">
        <label className="text-sm text-gray-400">Эмоции при открытии</label>
        <input
          value={emotionEntry}
          onChange={(e) => setEmotionEntry(e.target.value)}
          list={`cj-emotion-entry-${formInstanceId}`}
          autoComplete="off"
          className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] p-2"
          placeholder="Из списка или свой текст"
        />
        <datalist id={`cj-emotion-entry-${formInstanceId}`}>
          {emotionOptions.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
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
            onClick={() => setEntryLiquidity("MAKER")}
            className={`rounded px-2 py-1 text-xs ${
              entryLiquidity === "MAKER" ? "bg-blue-700 text-white" : "bg-gray-800 text-gray-400"
            }`}
          >
            Maker {tradingDefaults.makerFeeBps} bps
          </button>
          <button
            type="button"
            onClick={() => setEntryLiquidity("TAKER")}
            className={`rounded px-2 py-1 text-xs ${
              entryLiquidity === "TAKER" ? "bg-blue-700 text-white" : "bg-gray-800 text-gray-400"
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
        onClick={onSubmit}
        className="bg-blue-600 h-[42px] rounded hover:bg-blue-700"
      >
        Добавить
      </button>
    </div>
  )
}
