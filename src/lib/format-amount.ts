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

/**
 * Краткий вывод для UI: если целая часть по модулю < 10 — ровно 2 знака после запятой,
 * иначе округление до целого без дробной части.
 */
export function formatDisplayNumber(n: number): string {
  if (!Number.isFinite(n)) return "—"
  const intPart = Math.trunc(Math.abs(n))
  if (intPart < 10) {
    const s = n.toFixed(2)
    if (s === "-0.00") return "0.00"
    return s
  }
  return String(Math.round(n))
}

/** То же правило, что {@link formatDisplayNumber} (значение уже в процентах). */
export function formatDisplayPercent(n: number): string {
  return formatDisplayNumber(n)
}

/** Группировка целой части пробелами по 3 цифры (9 088). */
function groupIntegerDigits(intDigits: string): string {
  return intDigits.replace(/\B(?=(\d{3})+(?!\d))/g, " ")
}

/**
 * Число для UI с группировкой разрядов; правило знаков как у {@link formatDisplayNumber}.
 */
export function formatDisplayNumberGrouped(n: number): string {
  if (!Number.isFinite(n)) return "—"
  const intPart = Math.trunc(Math.abs(n))
  if (intPart < 10) {
    const raw = n.toFixed(2)
    if (raw === "-0.00") return "0.00"
    const sign = raw.startsWith("-") ? "-" : ""
    const body = sign ? raw.slice(1) : raw
    const dot = body.indexOf(".")
    if (dot === -1) return sign + groupIntegerDigits(body)
    const intStr = groupIntegerDigits(body.slice(0, dot))
    return `${sign}${intStr}${body.slice(dot)}`
  }
  const sign = n < 0 ? "-" : ""
  return sign + groupIntegerDigits(String(intPart))
}

/** {@link formatInQuoteDisplay} с группировкой разрядов. */
export function formatInQuoteDisplayGrouped(n: number, quote: string): string {
  if (!Number.isFinite(n)) return "—"
  return `${formatDisplayNumberGrouped(n)} ${quote}`
}

/** Значение + валюта котировки (например `1,23 USDT`). */
export function formatInQuote(n: number, quote: string): string {
  if (!Number.isFinite(n)) return "—"
  return `${formatDecimal(n)} ${quote}`
}

/** {@link formatInQuote} с правилом {@link formatDisplayNumber} и группировкой разрядов. */
export function formatInQuoteDisplay(n: number, quote: string): string {
  return formatInQuoteDisplayGrouped(n, quote)
}

/** Среднее время удержания: < 1 ч — в минутах, иначе в часах (display). */
export function formatHoldingDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—"
  const hours = ms / 3_600_000
  if (hours < 1) {
    const mins = Math.max(1, Math.round(ms / 60_000))
    return `${mins} мин`
  }
  return `${formatDisplayNumber(hours)} ч`
}
