import { z } from "zod"

export const cashflowCreateBodySchema = z
  .object({
    type: z.enum(["DEPOSIT", "WITHDRAWAL", "TRANSFER"]),
    accountId: z.string().min(1).optional(),
    fromAccountId: z.string().min(1).optional(),
    toAccountId: z.string().min(1).optional(),
    amount: z.coerce.number().positive(),
    currency: z.string().min(1).max(32),
    fxRate: z.coerce.number().positive().optional().nullable(),
    fee: z.coerce.number().nonnegative().optional().nullable(),
    timestamp: z.string().min(1),
    note: z.string().max(2000).optional().nullable(),
  })
  .strict()

export const cashflowPatchBodySchema = cashflowCreateBodySchema.partial().strict()

export type CashflowCreateBody = z.infer<typeof cashflowCreateBodySchema>
export type CashflowPatchBody = z.infer<typeof cashflowPatchBodySchema>
