"use client"

import { Fragment, type Dispatch, type SetStateAction } from "react"
import type { TradeListItemDto } from "@/contracts/trades"
import { formatDecimal, formatInQuote } from "@/lib/format-amount"
import { quoteCurrencyFromSymbol } from "@/lib/quote-currency"

type Liquidity = "MAKER" | "TAKER"

type Props = {
  openTrades: TradeListItemDto[]
  expanded: Record<string, boolean>
  setExpanded: Dispatch<SetStateAction<Record<string, boolean>>>
  exitPriceById: Record<string, string>
  setExitPriceById: Dispatch<SetStateAction<Record<string, string>>>
  exitLiquidityById: Record<string, Liquidity>
  setExitLiquidityById: Dispatch<SetStateAction<Record<string, Liquidity>>>
  exitVolumeById: Record<string, string>
  setExitVolumeById: Dispatch<SetStateAction<Record<string, string>>>
  emotionExitById: Record<string, string>
  setEmotionExitById: Dispatch<SetStateAction<Record<string, string>>>
  feeById: Record<string, string>
  setFeeById: Dispatch<SetStateAction<Record<string, string>>>
  fundingById: Record<string, string>
  setFundingById: Dispatch<SetStateAction<Record<string, string>>>
  closeTrade: (_id: string) => void
  deleteTrade: (_id: string) => void
  setExitVolumeFraction: (_tradeId: string, _remaining: number, _fraction: number) => void
  /** Справочник эмоций (выход) */
  emotionExitOptions?: string[]
}

export function OpenTradesTable({
  openTrades,
  expanded,
  setExpanded,
  exitPriceById,
  setExitPriceById,
  exitLiquidityById,
  setExitLiquidityById,
  exitVolumeById,
  setExitVolumeById,
  emotionExitById,
  setEmotionExitById,
  feeById,
  setFeeById,
  fundingById,
  setFundingById,
  closeTrade,
  deleteTrade,
  setExitVolumeFraction,
  emotionExitOptions = [],
}: Props) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-800 text-left text-gray-400">
            <th className="py-2 pr-2">Символ</th>
            <th className="py-2 pr-2">Рынок</th>
            <th className="py-2 pr-2">Напр.</th>
            <th className="py-2 pr-2">Маржа</th>
            <th className="py-2 pr-2">Осталось</th>
            <th className="py-2 pr-2">Плечо</th>
            <th className="py-2 pr-2">Вход (ср.)</th>
            <th className="py-2 pr-2">Выход (ср.)</th>
            <th className="py-2 pr-2">PnL (реал.)</th>
            <th className="py-2">Действия</th>
          </tr>
        </thead>
        <tbody>
          {openTrades.map((t) => {
            const q = quoteCurrencyFromSymbol(t.symbol)
            const j = t.journal
            const displayPnl = j.displayPnl
            const showPnl = displayPnl != null && j.exitVolume > 0

            return (
              <Fragment key={t.id}>
                <tr className="border-b border-gray-900">
                  <td className="py-2 pr-2">{t.symbol}</td>
                  <td className="py-2 pr-2">{t.marketType}</td>
                  <td className="py-2 pr-2">{t.direction}</td>
                  <td className="py-2 pr-2">
                    {j.entryVolume ? formatInQuote(j.entryVolume, q) : "—"}
                  </td>
                  <td className="py-2 pr-2">
                    {j.remainingVolume > 0 ? formatInQuote(j.remainingVolume, q) : `0 ${q}`}
                  </td>
                  <td className="py-2 pr-2">{j.maxLeverage ? `${j.maxLeverage}x` : "—"}</td>
                  <td className="py-2 pr-2">{j.avgEntry ? formatDecimal(j.avgEntry) : "—"}</td>
                  <td className="py-2 pr-2">{j.avgExit != null ? formatDecimal(j.avgExit) : "—"}</td>
                  <td
                    className={
                      showPnl && displayPnl! > 0
                        ? "text-green-400"
                        : showPnl && displayPnl! < 0
                          ? "text-red-400"
                          : "text-gray-300"
                    }
                  >
                    {showPnl ? formatInQuote(displayPnl!, q) : "—"}
                  </td>
                  <td className="py-2">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => setExpanded((p) => ({ ...p, [t.id]: !(p[t.id] ?? false) }))}
                        className="bg-gray-800 px-2 py-1 rounded text-xs hover:bg-gray-700"
                      >
                        {expanded[t.id] ? "Скрыть" : "Детали"}
                      </button>
                      {t.status === "OPEN" && (
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
                                setExitLiquidityById((p) => ({ ...p, [t.id]: "MAKER" }))
                              }
                              className={`rounded px-1.5 py-0.5 text-[10px] ${
                                (exitLiquidityById[t.id] ?? "TAKER") === "MAKER"
                                  ? "bg-blue-700"
                                  : "bg-gray-700"
                              }`}
                            >
                              M
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setExitLiquidityById((p) => ({ ...p, [t.id]: "TAKER" }))
                              }
                              className={`rounded px-1.5 py-0.5 text-[10px] ${
                                (exitLiquidityById[t.id] ?? "TAKER") === "TAKER"
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
                              placeholder={`Маржа (макс. ${formatDecimal(j.remainingVolume)} ${q})`}
                              className="bg-gray-800 px-2 py-1 rounded border border-gray-700 text-xs w-32"
                            />
                            {j.remainingVolume > 0 && (
                              <div className="flex flex-wrap gap-1">
                                {(
                                  [
                                    ["25%", 0.25],
                                    ["50%", 0.5],
                                    ["75%", 0.75],
                                    ["100%", 1],
                                  ] as const
                                ).map(([label, frac]) => (
                                  <button
                                    key={label}
                                    type="button"
                                    onClick={() =>
                                      setExitVolumeFraction(t.id, j.remainingVolume, frac)
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
                            list={`cj-emotion-exit-${t.id}`}
                            autoComplete="off"
                            placeholder="Эмоции выхода"
                            className="w-36 rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-xs"
                          />
                          <datalist id={`cj-emotion-exit-${t.id}`}>
                            {emotionExitOptions.map((n) => (
                              <option key={n} value={n} />
                            ))}
                          </datalist>
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
                              .sort(
                                (a, b) =>
                                  new Date(a.timestamp).getTime() -
                                  new Date(b.timestamp).getTime(),
                              )
                              .map((e) => (
                                <div key={e.id} className="flex justify-between gap-3">
                                  <span className="text-gray-400">
                                    {new Date(e.timestamp).toLocaleString()}
                                  </span>
                                  <span>цена: {formatDecimal(e.price)}</span>
                                  <span>маржа: {formatInQuote(e.volume, q)}</span>
                                  <span>lev: {e.leverage ?? "—"}</span>
                                  <span>
                                    fee: {e.fee != null ? formatInQuote(Number(e.fee), q) : "—"}
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
                                .sort(
                                  (a, b) =>
                                    new Date(a.timestamp).getTime() -
                                    new Date(b.timestamp).getTime(),
                                )
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
                                      fee {x.fee != null ? formatInQuote(Number(x.fee), q) : "—"}
                                    </span>
                                    <span>
                                      fnd{" "}
                                      {x.funding != null ? formatInQuote(Number(x.funding), q) : "—"}
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
                        strategy: <span className="text-gray-200">{t.strategy ?? "—"}</span> ·
                        emotion entry:{" "}
                        <span className="text-gray-200">{t.emotionEntry ?? "—"}</span> · emotion
                        exit: <span className="text-gray-200">{t.emotionExit ?? "—"}</span> · fee:{" "}
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
  )
}
