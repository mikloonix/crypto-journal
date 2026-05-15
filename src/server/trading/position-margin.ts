import type { Entry, Exit } from "@prisma/client"

/** `Entry.volume` / `Exit.volume` в БД — маржа в USDT (этап 4, вариант B). */

export function effectiveLeverage(leverage: number | null | undefined): number {
  if (leverage != null && Number.isFinite(leverage) && leverage > 0) {
    return leverage
  }
  return 1
}

/** Номинал позиции USDT = маржа × плечо. */
export function notionalFromMarginUsdt(
  marginUsdt: number,
  leverage: number | null | undefined,
): number {
  if (!Number.isFinite(marginUsdt) || marginUsdt <= 0) return 0
  return marginUsdt * effectiveLeverage(leverage)
}

/** Объём контракта (qty) = маржа × плечо / цена. */
export function contractQtyFromMargin(
  marginUsdt: number,
  price: number,
  leverage: number | null | undefined,
): number {
  if (!Number.isFinite(price) || price <= 0) return 0
  return notionalFromMarginUsdt(marginUsdt, leverage) / price
}

export function sumEntryMarginUsdt(entries: Pick<Entry, "volume">[]): number {
  return entries.reduce((s, e) => s + e.volume, 0)
}

export function sumExitMarginUsdt(exits: Pick<Exit, "volume">[]): number {
  return exits.reduce((s, e) => s + e.volume, 0)
}

/** Плечо для закрытия: максимум по входам (типичный кейс одного плеча на трейд). */
export function tradeLeverageFromEntries(entries: Pick<Entry, "leverage">[]): number {
  if (entries.length === 0) return 1
  return Math.max(...entries.map((e) => effectiveLeverage(e.leverage)))
}

/** Средняя цена входа по объёму контрактов. */
export function weightedAvgEntryPrice(entries: Pick<Entry, "price" | "volume" | "leverage">[]): number {
  let qtySum = 0
  let valueSum = 0
  for (const e of entries) {
    const q = contractQtyFromMargin(e.volume, e.price, e.leverage)
    if (q <= 0) continue
    qtySum += q
    valueSum += q * e.price
  }
  if (qtySum <= 0) return 0
  return valueSum / qtySum
}

/** Стоимость ног в USDT: Σ (qty × price) = Σ (margin × leverage) при закрытии по той же цене. */
export function legsNotionalUsdt(
  legs: Array<{ price: number; volume: number; leverage?: number | null }>,
  defaultLeverage: number,
): number {
  let sum = 0
  for (const leg of legs) {
    const lev = leg.leverage != null ? leg.leverage : defaultLeverage
    sum += notionalFromMarginUsdt(leg.volume, lev)
  }
  return sum
}

export function entryLegsNotionalUsdt(entries: Pick<Entry, "price" | "volume" | "leverage">[]): number {
  return legsNotionalUsdt(entries, 1)
}

export function exitLegsNotionalUsdt(
  exits: Pick<Exit, "price" | "volume">[],
  entryLeverage: number,
): number {
  return exits.reduce((s, x) => s + notionalFromMarginUsdt(x.volume, entryLeverage), 0)
}
