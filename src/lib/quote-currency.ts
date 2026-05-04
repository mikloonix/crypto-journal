/**
 * Валюта котировки из символа пары (BTCUSDT → USDT, BTCBNB → BNB).
 * Суффикс ищется по известным котировкам (длинные раньше коротких).
 */
const QUOTE_SUFFIXES = [
  "USDT",
  "USDC",
  "FDUSD",
  "BUSD",
  "TUSD",
  "USDD",
  "TRY",
  "EUR",
  "GBP",
  "USD",
  "BTC",
  "ETH",
  "BNB",
  "SOL",
  "XRP",
  "DOGE",
  "TRX",
] as const

const SORTED = [...QUOTE_SUFFIXES].sort((a, b) => b.length - a.length)

export function quoteCurrencyFromSymbol(symbol: string): string {
  const s = symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "")
  if (!s) return "USDT"
  for (const q of SORTED) {
    if (s.endsWith(q) && s.length > q.length) return q
  }
  if (s.length >= 6) return s.slice(-4)
  return "USDT"
}
