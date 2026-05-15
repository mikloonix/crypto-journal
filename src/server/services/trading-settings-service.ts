import { MAX_LEVERAGE_UI } from "@/lib/trading-symbols"
import { BINGX_VIP_MAX_TIER, feeBpsForVipTier } from "@/lib/bingx-vip"
import { isValidIanaTimeZone } from "@/lib/iana-time-zone"
import type { TradingDefaultsDto } from "@/contracts/trades"
import { accountRepository } from "@/server/repositories/account-repository"
import { riskSettingsRepository } from "@/server/repositories/risk-settings-repository"
import { tradingSettingsPatchSchema } from "@/server/validation/trading-settings"
import { zodErrorMessage } from "@/server/validation/zod-helpers"

export const tradingSettingsService = {
  async getTradingDefaults(userId: string): Promise<TradingDefaultsDto> {
    const row = await riskSettingsRepository.upsertDefaults(userId)
    return {
      defaultFeeUsdt: row.defaultFeeUsdt,
      makerFeeBps: row.makerFeeBps,
      takerFeeBps: row.takerFeeBps,
      bingxVipTier: row.bingxVipTier,
      maxLeverage: MAX_LEVERAGE_UI,
      activeAccountId: row.activeAccountId ?? null,
      journalAllAccounts: row.journalAllAccounts ?? false,
      displayTimeZone: (row.displayTimeZone && String(row.displayTimeZone).trim()) || "UTC",
    }
  },

  async patchTradingDefaults(
    userId: string,
    body: unknown,
  ): Promise<
    | { ok: true; data: TradingDefaultsDto }
    | { ok: false; error: string; status: number }
  > {
    const parsed = tradingSettingsPatchSchema.safeParse(body)
    if (!parsed.success) {
      return { ok: false, error: zodErrorMessage(parsed.error), status: 400 }
    }
    const o = parsed.data

    const defaultFeeUsdt = o.defaultFeeUsdt ?? undefined
    const makerFeeBps = o.makerFeeBps ?? undefined
    const takerFeeBps = o.takerFeeBps ?? undefined
    const vipTier = o.bingxVipTier ?? undefined
    const activeAccountId = o.activeAccountId
    const journalAllAccounts = o.journalAllAccounts
    const displayTimeZone =
      o.displayTimeZone != null && String(o.displayTimeZone).trim() !== ""
        ? String(o.displayTimeZone).trim()
        : undefined

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

    if (activeAccountId !== undefined && activeAccountId !== null) {
      const acc = await accountRepository.findFirst(userId, activeAccountId)
      if (!acc) {
        return { ok: false, error: "Неверный счёт", status: 400 }
      }
    }

    if (displayTimeZone !== undefined && !isValidIanaTimeZone(displayTimeZone)) {
      return { ok: false, error: "Некорректный displayTimeZone (IANA)", status: 400 }
    }

    const updateData: {
      defaultFeeUsdt?: number
      makerFeeBps?: number
      takerFeeBps?: number
      bingxVipTier?: number
      activeAccountId?: string | null
      journalAllAccounts?: boolean
      displayTimeZone?: string
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
    if (activeAccountId !== undefined) {
      updateData.activeAccountId = activeAccountId
    }
    if (journalAllAccounts !== undefined) {
      updateData.journalAllAccounts = journalAllAccounts
    }
    if (displayTimeZone !== undefined) {
      updateData.displayTimeZone = displayTimeZone
    }

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
        activeAccountId: row.activeAccountId ?? null,
        journalAllAccounts: row.journalAllAccounts ?? false,
        displayTimeZone: (row.displayTimeZone && String(row.displayTimeZone).trim()) || "UTC",
      },
    }
  },
}
