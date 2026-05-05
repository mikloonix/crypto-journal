import { MAX_LEVERAGE_UI } from "@/lib/trading-symbols"
import { BINGX_VIP_MAX_TIER, feeBpsForVipTier } from "@/lib/bingx-vip"
import type { TradingDefaultsDto } from "@/contracts/trades"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"

export const tradingSettingsService = {
  async getTradingDefaults(userId: string): Promise<TradingDefaultsDto> {
    const row = await riskSettingsRepository.upsertDefaults(userId)
    return {
      defaultFeeUsdt: row.defaultFeeUsdt,
      makerFeeBps: row.makerFeeBps,
      takerFeeBps: row.takerFeeBps,
      bingxVipTier: row.bingxVipTier,
      maxLeverage: MAX_LEVERAGE_UI,
    }
  },

  async patchTradingDefaults(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<
    | { ok: true; data: TradingDefaultsDto }
    | { ok: false; error: string; status: number }
  > {
    const defaultFeeUsdtRaw = body.defaultFeeUsdt
    const defaultFeeUsdt =
      defaultFeeUsdtRaw === null || defaultFeeUsdtRaw === undefined || defaultFeeUsdtRaw === ""
        ? undefined
        : Number(defaultFeeUsdtRaw)

    const makerRaw = body.makerFeeBps
    const takerRaw = body.takerFeeBps
    const makerFeeBps =
      makerRaw === null || makerRaw === undefined || makerRaw === "" ? undefined : Number(makerRaw)
    const takerFeeBps =
      takerRaw === null || takerRaw === undefined || takerRaw === "" ? undefined : Number(takerRaw)

    const vipRaw = body.bingxVipTier
    const vipTier =
      vipRaw === null || vipRaw === undefined || vipRaw === "" ? undefined : Number(vipRaw)

    if (
      defaultFeeUsdt !== undefined &&
      (!Number.isFinite(defaultFeeUsdt) || defaultFeeUsdt < 0)
    ) {
      return { ok: false, error: "Invalid defaultFeeUsdt", status: 400 }
    }
    if (makerFeeBps !== undefined && (!Number.isFinite(makerFeeBps) || makerFeeBps < 0)) {
      return { ok: false, error: "Invalid makerFeeBps", status: 400 }
    }
    if (takerFeeBps !== undefined && (!Number.isFinite(takerFeeBps) || takerFeeBps < 0)) {
      return { ok: false, error: "Invalid takerFeeBps", status: 400 }
    }
    if (
      vipTier !== undefined &&
      (!Number.isFinite(vipTier) || vipTier < 0 || vipTier > BINGX_VIP_MAX_TIER)
    ) {
      return {
        ok: false,
        error: `bingxVipTier must be 0..${BINGX_VIP_MAX_TIER}`,
        status: 400,
      }
    }

    const updateData: {
      defaultFeeUsdt?: number
      makerFeeBps?: number
      takerFeeBps?: number
      bingxVipTier?: number
    } = {}

    if (vipTier !== undefined) {
      const { makerBps, takerBps } = feeBpsForVipTier(vipTier)
      updateData.bingxVipTier = Math.round(vipTier)
      updateData.makerFeeBps = makerBps
      updateData.takerFeeBps = takerBps
    }

    if (defaultFeeUsdt !== undefined) updateData.defaultFeeUsdt = defaultFeeUsdt
    if (makerFeeBps !== undefined) updateData.makerFeeBps = makerFeeBps
    if (takerFeeBps !== undefined) updateData.takerFeeBps = takerFeeBps

    if (Object.keys(updateData).length === 0) {
      return { ok: false, error: "No fields to update", status: 400 }
    }

    const row = await riskSettingsRepository.upsertWithUpdate(userId, updateData)

    return {
      ok: true,
      data: {
        defaultFeeUsdt: row.defaultFeeUsdt,
        makerFeeBps: row.makerFeeBps,
        takerFeeBps: row.takerFeeBps,
        bingxVipTier: row.bingxVipTier,
        maxLeverage: MAX_LEVERAGE_UI,
      },
    }
  },
}
