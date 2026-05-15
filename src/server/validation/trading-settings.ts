import { z } from "zod"

export const tradingSettingsPatchSchema = z
  .object({
    defaultFeeUsdt: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
    makerFeeBps: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
    takerFeeBps: z.union([z.coerce.number().nonnegative(), z.null()]).optional(),
    bingxVipTier: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
    activeAccountId: z.union([z.string().min(1).max(40), z.null()]).optional(),
    journalAllAccounts: z.boolean().optional(),
    displayTimeZone: z.union([z.string().min(1).max(64), z.null()]).optional(),
  })
  .strict()

export type TradingSettingsPatchBody = z.infer<typeof tradingSettingsPatchSchema>
