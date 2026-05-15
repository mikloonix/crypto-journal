import { z } from "zod"

export const tradePatchBodySchema = z
  .object({
    stopLossPrice: z.union([z.coerce.number().positive(), z.null()]).optional(),
  })
  .strict()
