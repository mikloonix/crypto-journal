import { z } from "zod"

const YMD = /^\d{4}-\d{2}-\d{2}$/

export const riskSettingsPatchSchema = z
  .object({
    accountBalance: z.coerce.number().positive().optional(),
    riskPerTrade: z.coerce.number().min(0).max(100).optional(),
    riskPerDay: z.coerce.number().min(0).max(100).optional(),
    maxDrawdown: z.coerce.number().min(0).max(100).optional(),
    maxOpenRisk: z.coerce.number().min(0).max(100).optional(),
    forecastDepositTargetUsdt: z.union([z.coerce.number().positive(), z.null()]).optional(),
    forecastPlanDepositTargetUsdt: z.union([z.coerce.number().positive(), z.null()]).optional(),
    forecastTradeRoiPercent: z.union([z.coerce.number().min(0.5).max(100), z.null()]).optional(),
    forecastPlanTradeRoiPercent: z.union([z.coerce.number().min(0.5).max(100), z.null()]).optional(),
    forecastStartedAtYmd: z
      .union([
        z
          .string()
          .trim()
          .regex(YMD, "forecastStartedAtYmd: ожидается yyyy-MM-dd"),
        z.null(),
      ])
      .optional(),
    forecastStartEquityUsdt: z.union([z.coerce.number().positive(), z.null()]).optional(),
    forecastStartTradesToGoal: z.union([z.coerce.number().int().min(0), z.null()]).optional(),
    forecastDeadlineYmd: z
      .union([
        z
          .string()
          .trim()
          .regex(YMD, "forecastDeadlineYmd: ожидается yyyy-MM-dd"),
        z.null(),
      ])
      .optional(),
  })
  .strict()

export type RiskSettingsPatchBody = z.infer<typeof riskSettingsPatchSchema>
