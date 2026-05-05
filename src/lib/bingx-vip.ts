/**
 * Ориентир по уровням VIP BingX perpetual USDT (maker/taker в bps).
 * Точные значения меняются на бирже — при расхождении сверяйте https://bingx.com/fee
 */
export const BINGX_VIP_MAX_TIER = 5

export function feeBpsForVipTier(tier: number): { makerBps: number; takerBps: number } {
  const t = Math.max(0, Math.min(BINGX_VIP_MAX_TIER, Math.floor(Number(tier)) || 0))
  switch (t) {
    case 0:
      return { makerBps: 2, takerBps: 5 }
    case 1:
      return { makerBps: 1.8, takerBps: 4.5 }
    case 2:
      return { makerBps: 1.6, takerBps: 4 }
    case 3:
      return { makerBps: 1.4, takerBps: 3.5 }
    case 4:
      return { makerBps: 1, takerBps: 3 }
    case 5:
    default:
      return { makerBps: 0, takerBps: 2.8 }
  }
}
