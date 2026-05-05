"use client"

import type { Dispatch, SetStateAction } from "react"
import type { TradeListItemDto } from "@/contracts/trades"
import { formatDurationMs } from "@/lib/format-duration"
import { formatDecimal, formatInQuote, formatPercent } from "@/lib/format-amount"
import { quoteCurrencyFromSymbol } from "@/lib/quote-currency"

type Props = {
  trades: TradeListItemDto[]
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  onDeleteTrade: (_id: string) => void
}

export function ClosedTradesMobileCards({
  trades,
  expanded,
  setExpanded,
  onDeleteTrade,
}: Props) {
  return (
    <div className="flex flex-col gap-3">
      {trades.map((t) => {
        const q = quoteCurrencyFromSymbol(t.symbol)
        const j = t.journal
        const pnl = j.displayPnl ?? 0
        const roi = j.tradeRoiPct ?? 0
        const open = expanded[t.id] ?? false
        return (
          <div
            key={t.id}
            className="rounded-lg border border-gray-800 bg-[#0b0b0b] p-3 text-sm text-gray-200"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <div className="font-medium text-white">{t.symbol}</div>
                <div className="text-xs text-gray-500">
                  {t.marketType} · {t.direction}
                </div>
              </div>
              <div className="text-right">
                <div className={pnl > 0 ? "text-green-400" : pnl < 0 ? "text-red-400" : ""}>
                  {formatInQuote(pnl, q)}
                </div>
                <div className={roi > 0 ? "text-green-400" : roi < 0 ? "text-red-400" : ""}>
                  {formatPercent(roi)}%
                </div>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-xs text-gray-400">
              <span>Маржа</span>
              <span className="text-gray-200">{formatInQuote(j.entryVolume, q)}</span>
              <span>Вход / выход</span>
              <span className="text-gray-200">
                {j.avgEntry ? formatDecimal(j.avgEntry) : "—"} /{" "}
                {j.avgExit != null ? formatDecimal(j.avgExit) : "—"}
              </span>
              <span>Комис. / фанд.</span>
              <span className="text-gray-200">
                {formatInQuote(t.fee, q)} / {formatInQuote(t.funding, q)}
              </span>
              <span>Длит.</span>
              <span className="text-gray-200">{formatDurationMs(j.durationMs)}</span>
              <span>Закрыто</span>
              <span className="text-gray-200">
                {t.closedAt ? new Date(t.closedAt).toLocaleString() : "—"}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setExpanded((p) => ({ ...p, [t.id]: !open }))}
                className="rounded bg-gray-800 px-2 py-1 text-xs hover:bg-gray-700"
              >
                {open ? "Скрыть" : "Детали"}
              </button>
              <button
                type="button"
                onClick={() => onDeleteTrade(t.id)}
                className="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
              >
                В корзину
              </button>
            </div>
            {open && (
              <div className="mt-3 space-y-3 border-t border-gray-800 pt-2 text-xs text-gray-400">
                <div>
                  Стратегия: <span className="text-gray-200">{t.strategy ?? "—"}</span> · эмоции:{" "}
                  <span className="text-gray-200">
                    {t.emotionEntry ?? "—"} → {t.emotionExit ?? "—"}
                  </span>
                </div>
                <div>
                  <div className="mb-1 text-gray-500">Входы</div>
                  <div className="space-y-1">
                    {t.entries
                      .slice()
                      .sort(
                        (a, b) =>
                          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
                      )
                      .map((e) => (
                        <div key={e.id} className="flex flex-wrap justify-between gap-1 text-gray-300">
                          <span>{new Date(e.timestamp).toLocaleString()}</span>
                          <span>{formatDecimal(e.price)}</span>
                          <span>{formatInQuote(e.volume, q)}</span>
                          <span>fee {formatInQuote(e.fee, q)}</span>
                        </div>
                      ))}
                  </div>
                </div>
                <div>
                  <div className="mb-1 text-gray-500">Выходы</div>
                  <div className="space-y-1">
                    {t.exits.length === 0 ? (
                      <span className="text-gray-600">—</span>
                    ) : (
                      t.exits
                        .slice()
                        .sort(
                          (a, b) =>
                            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
                        )
                        .map((x) => (
                          <div key={x.id} className="flex flex-wrap justify-between gap-1 text-gray-300">
                            <span>{new Date(x.timestamp).toLocaleString()}</span>
                            <span>{formatDecimal(x.price)}</span>
                            <span>{formatInQuote(x.volume, q)}</span>
                            <span>fee {formatInQuote(x.fee, q)}</span>
                            <span>fnd {formatInQuote(x.funding, q)}</span>
                          </div>
                        ))
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
