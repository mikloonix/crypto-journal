import { MarketType, TradeStatus } from "@prisma/client"
import { z } from "zod"

const FILTER_KEYS = [
  "status",
  "symbol",
  "strategy",
  "marketType",
  "from",
  "to",
  "dateBasis",
  "accountId",
] as const

const querySchema = z
  .object({
    status: z.enum(["OPEN", "CLOSED"]).optional(),
    symbol: z.string().max(64).optional(),
    strategy: z.string().max(200).optional(),
    marketType: z.enum(["SPOT", "FUTURE"]).optional(),
    from: z.string().max(40).optional(),
    to: z.string().max(40).optional(),
    dateBasis: z.enum(["createdAt", "closedAt"]).optional(),
    accountId: z.string().min(1).max(40).optional(),
  })
  .strict()

export type JournalListFilters = {
  status?: TradeStatus
  symbol?: string
  strategy?: string
  marketType?: MarketType
  dateFrom?: Date
  dateTo?: Date
  dateField: "createdAt" | "closedAt"
  accountId?: string
}

export type JournalListParseResult =
  | { kind: "none" }
  | { kind: "ok"; filters: JournalListFilters }
  | { kind: "error"; message: string }

/** После проверки в route — без варианта error. */
export type JournalListQueryForService = Extract<
  JournalListParseResult,
  { kind: "none" } | { kind: "ok" }
>

/**
 * Парсинг query string для GET /api/trades (этап 2 — фильтры журнала).
 */
export function parseJournalListQuery(searchParams: URLSearchParams): JournalListParseResult {
  const hasAny = FILTER_KEYS.some((k) => {
    const v = searchParams.get(k)
    return v != null && v !== ""
  })
  if (!hasAny) return { kind: "none" }

  const raw: Record<string, string> = {}
  for (const key of FILTER_KEYS) {
    const v = searchParams.get(key)
    if (v != null && v !== "") raw[key] = v
  }

  const parsed = querySchema.safeParse(raw)
  if (!parsed.success) {
    return { kind: "error", message: "Некорректные параметры фильтра" }
  }

  const o = parsed.data
  const dateField: "createdAt" | "closedAt" =
    o.dateBasis === "closedAt" ? "closedAt" : "createdAt"

  let dateFrom: Date | undefined
  let dateTo: Date | undefined
  if (o.from) {
    const d = new Date(o.from)
    if (!Number.isFinite(d.getTime())) {
      return { kind: "error", message: "Некорректная дата from" }
    }
    dateFrom = d
  }
  if (o.to) {
    const d = new Date(o.to)
    if (!Number.isFinite(d.getTime())) {
      return { kind: "error", message: "Некорректная дата to" }
    }
    dateTo = d
  }

  const filters: JournalListFilters = { dateField }
  if (o.status === "OPEN") filters.status = TradeStatus.OPEN
  if (o.status === "CLOSED") filters.status = TradeStatus.CLOSED
  if (o.symbol?.trim()) filters.symbol = o.symbol.trim()
  if (o.strategy?.trim()) filters.strategy = o.strategy.trim()
  if (o.marketType === "SPOT") filters.marketType = MarketType.SPOT
  if (o.marketType === "FUTURE") filters.marketType = MarketType.FUTURE
  if (dateFrom) filters.dateFrom = dateFrom
  if (dateTo) filters.dateTo = dateTo
  if (o.accountId?.trim()) filters.accountId = o.accountId.trim()

  return { kind: "ok", filters }
}
