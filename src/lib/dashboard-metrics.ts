/**
 * Метрики дашборда 2.6 (день, усреднение) — единая точка формул.
 * Не дублировать в UI.
 */

import { Direction } from "@prisma/client"

const MS_PER_DAY = 86_400_000

/** Макс. длина интервала для day-stats (анти-абьюз). */
export const DASHBOARD_DAY_RANGE_MAX_MS = 2 * MS_PER_DAY

export function parseIsoToDate(iso: string): Date | null {
  const d = new Date(iso)
  return Number.isFinite(d.getTime()) ? d : null
}

export function validateDayStatsRange(start: Date, endExclusive: Date): string | null {
  if (endExclusive.getTime() <= start.getTime()) {
    return "dayEndExclusive должен быть позже dayStart"
  }
  if (endExclusive.getTime() - start.getTime() > DASHBOARD_DAY_RANGE_MAX_MS) {
    return "Слишком длинный интервал дат"
  }
  return null
}

/**
 * safeZonePercent в долях цены: ((risk%/100) / 2) / leverage
 * riskPercent — как в RiskSettings.riskPerTrade (например 1 = 1%).
 */
export function safeZoneFraction(riskPerTradePercent: number, leverage: number): number {
  const lev = Math.max(1, leverage)
  const r = Math.max(0, riskPerTradePercent) / 100
  return r / 2 / lev
}

export function safeZoneBounds(
  avgEntry: number,
  riskPerTradePercent: number,
  leverage: number,
): { low: number; high: number } {
  const z = safeZoneFraction(riskPerTradePercent, leverage)
  return {
    low: avgEntry * (1 - z),
    high: avgEntry * (1 + z),
  }
}

/**
 * MVP без истории свечей: «экстремум» = max(entry, current) для LONG и min для SHORT.
 */
export function pullbackPercentMvp(
  direction: Direction,
  avgEntry: number,
  currentPrice: number,
): number | null {
  if (!(avgEntry > 0) || !(currentPrice > 0)) return null
  if (direction === Direction.LONG) {
    const peak = Math.max(avgEntry, currentPrice)
    return ((peak - currentPrice) / avgEntry) * 100
  }
  const trough = Math.min(avgEntry, currentPrice)
  return ((currentPrice - trough) / avgEntry) * 100
}

export function hourlyReturnPercent(priceNow: number, price1hAgo: number): number | null {
  if (!(priceNow > 0) || !(price1hAgo > 0)) return null
  return ((priceNow - price1hAgo) / price1hAgo) * 100
}

/** Проверка, что стоп на «защитной» стороне от текущей цены. */
export function stopPlacementValid(
  direction: Direction,
  currentPrice: number,
  stopPrice: number,
): boolean {
  if (!(currentPrice > 0) || !(stopPrice > 0)) return false
  if (direction === Direction.LONG) return stopPrice < currentPrice
  return stopPrice > currentPrice
}

/**
 * Упрощённая оценка добавляемой маржи (USDT): бюджет риска на сделку / относительное расстояние до стопа.
 * Кап по доле депозита от riskPerDay (MVP).
 */
export function suggestedMarginAddUsdtMvp(params: {
  accountBalance: number
  riskPerTradePercent: number
  riskPerDayPercent: number
  currentPrice: number
  stopPrice: number
}): { value: number | null; warning?: string } {
  const { accountBalance, riskPerTradePercent, riskPerDayPercent, currentPrice, stopPrice } =
    params
  if (!(accountBalance > 0) || !(currentPrice > 0) || !(stopPrice > 0)) {
    return { value: null }
  }
  const dist = Math.abs(currentPrice - stopPrice) / currentPrice
  if (dist < 1e-8) {
    return { value: null, warning: "Слишком близко к стопу — деление на ~0" }
  }
  const riskUsd = accountBalance * (Math.max(0, riskPerTradePercent) / 100)
  const raw = riskUsd / dist
  const dayCap = accountBalance * (Math.max(0, riskPerDayPercent) / 100)
  const capped = Math.min(raw, dayCap > 0 ? dayCap : raw)
  if (!Number.isFinite(capped) || capped <= 0) return { value: null }
  return { value: capped }
}
