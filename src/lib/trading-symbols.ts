/** Популярные пары для подсказок символа (USDT perpetual). Порядок — по частоте использования. */
export const TRADING_SYMBOL_SUGGESTIONS: string[] = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "DOGEUSDT",
  "ADAUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "DOTUSDT",
  "MATICUSDT",
  "LTCUSDT",
  "ATOMUSDT",
  "NEARUSDT",
  "APTUSDT",
  "ARBUSDT",
  "OPUSDT",
  "SUIUSDT",
  "INJUSDT",
  "TIAUSDT",
  "WIFUSDT",
  "PEPEUSDT",
  "1000PEPEUSDT",
  "ORDIUSDT",
  "FILUSDT",
]

const norm = (s: string) => s.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")

export function filterSymbolSuggestions(input: string, limit = 12): string[] {
  const q = norm(input)
  if (!q) return TRADING_SYMBOL_SUGGESTIONS.slice(0, limit)
  const scored = TRADING_SYMBOL_SUGGESTIONS.filter((sym) => sym.includes(q))
  return scored.slice(0, limit)
}

export const MAX_LEVERAGE_UI = 150
