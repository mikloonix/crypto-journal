/** Строка после toFixed: убираем лишние нули справа и завершающую точку. */
export function trimDecimalString(s: string): string {
  if (!s.includes(".")) return s
  return s.replace(/(\.\d*?[1-9])0+$/, "$1").replace(/\.0+$/, "").replace(/\.$/, "")
}

/**
 * Человекочитаемое число без «хвоста» из нулей.
 * @param maxDecimals — верхняя граница знаков после точки (по умолчанию 8).
 */
export function formatDecimal(n: number, maxDecimals = 8): string {
  if (!Number.isFinite(n)) return "—"
  const s = trimDecimalString(n.toFixed(maxDecimals))
  if (s === "-0" || s === "") return "0"
  return s
}

/** Проценты: до maxDecimals, без лишних нулей. */
export function formatPercent(n: number, maxDecimals = 4): string {
  if (!Number.isFinite(n)) return "—"
  return trimDecimalString(n.toFixed(maxDecimals))
}

/** Значение + валюта котировки (например `1,23 USDT`). */
export function formatInQuote(n: number, quote: string): string {
  if (!Number.isFinite(n)) return "—"
  return `${formatDecimal(n)} ${quote}`
}
