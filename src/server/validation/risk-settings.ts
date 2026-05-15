import { z } from "zod"

export const riskSettingsPatchSchema = z
  .object({
    accountBalance: z.coerce.number().positive().optional(),
    riskPerTrade: z.coerce.number().min(0).max(100).optional(),
    riskPerDay: z.coerce.number().min(0).max(100).optional(),
    maxDrawdown: z.coerce.number().min(0).max(100).optional(),
    maxOpenRisk: z.coerce.number().min(0).max(100).optional(),
  })
  .strict()

export type RiskSettingsPatchBody = z.infer<typeof riskSettingsPatchSchema>
