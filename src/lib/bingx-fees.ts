import { LiquidityRole } from "@prisma/client"

/** BingX USDT perpetual: стандартный VIP0 — maker 0.02%, taker 0.05% (в базисных пунктах от номинала). */
export const BINGX_DEFAULT_MAKER_FEE_BPS = 2
export const BINGX_DEFAULT_TAKER_FEE_BPS = 5

import { notionalFromMarginUsdt } from "@/server/trading/position-margin"

/**
 * Номинал в USDT: маржа × плечо (этап 4).
 * @param marginUsdt маржа в USDT (`Entry.volume` / `Exit.volume`)
 * @param leverage плечо (по умолчанию 1)
 */
export function notionalUsdt(
  marginUsdt: number,
  leverage: number | null | undefined = 1,
): number {
  return notionalFromMarginUsdt(marginUsdt, leverage)
}

type LiquidityInput = LiquidityRole | "MAKER" | "TAKER"

function isMakerRole(role: LiquidityInput): boolean {
  return String(role).toUpperCase() === "MAKER"
}

/** Комиссия = номинал × (bps / 10_000). */
export function feeUsdtFromBps(
  notional: number,
  role: LiquidityInput,
  makerBps: number,
  takerBps: number,
): number {
  if (notional <= 0) return 0
  const bps = isMakerRole(role) ? makerBps : takerBps
  if (!Number.isFinite(bps) || bps < 0) return 0
  return (notional * bps) / 10000
}

export function parseLiquidityRole(raw: unknown): LiquidityRole {
  const s = String(raw ?? "").toUpperCase()
  if (s === "MAKER") return LiquidityRole.MAKER
  return LiquidityRole.TAKER
}
