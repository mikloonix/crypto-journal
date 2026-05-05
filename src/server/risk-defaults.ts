import { BINGX_DEFAULT_MAKER_FEE_BPS, BINGX_DEFAULT_TAKER_FEE_BPS } from "@/lib/bingx-fees"

export const riskSettingsCreateDefaults = {
  accountBalance: 10000,
  riskPerTrade: 1.0,
  maxDrawdown: 20.0,
  riskPerDay: 3.0,
  maxOpenRisk: 5.0,
  defaultFeeUsdt: 0,
  makerFeeBps: BINGX_DEFAULT_MAKER_FEE_BPS,
  takerFeeBps: BINGX_DEFAULT_TAKER_FEE_BPS,
  bingxVipTier: 0,
} as const
