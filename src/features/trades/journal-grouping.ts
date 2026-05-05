import { endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from "date-fns"
import type { ExitDto, TradeListItemDto } from "@/contracts/trades"

/** Строка журнала «сделки = выход» для группировки. */
export type ExitJournalRow = { exit: ExitDto; trade: TradeListItemDto }

export type ClosedExitsGroup = {
  label: string
  rows: ExitJournalRow[]
  sumPnl: number
  groupRoiPct: number | null
}

export type JournalGroupMode = "none" | "day" | "week" | "month"

export type ClosedTradesGroup = {
  label: string
  trades: TradeListItemDto[]
  /** Сумма PnL по закрытым в группе (в валюте котировки каждой сделки — при смеси символов сумма условная). */
  sumPnl: number
  /** Σ PnL / Σ маржа по группе, % */
  groupRoiPct: number | null
}

function bucketMeta(
  d: Date,
  mode: Exclude<JournalGroupMode, "none">,
): { key: string; label: string } {
  if (mode === "day") {
    const sd = startOfDay(d)
    return {
      key: sd.toISOString(),
      label: sd.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" }),
    }
  }
  if (mode === "week") {
    const sw = startOfWeek(d, { weekStartsOn: 1 })
    const ew = endOfWeek(d, { weekStartsOn: 1 })
    return {
      key: sw.toISOString(),
      label: `${sw.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })} — ${ew.toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}`,
    }
  }
  const sm = startOfMonth(d)
  const em = endOfMonth(d)
  return {
    key: sm.toISOString(),
    label: `${sm.toLocaleDateString("ru-RU", { month: "long", year: "numeric" })} (${sm.toLocaleDateString("ru-RU", { day: "numeric" })} — ${em.toLocaleDateString("ru-RU", { day: "numeric" })})`,
  }
}

function aggregateClosedGroup(trades: TradeListItemDto[]): {
  sumPnl: number
  groupRoiPct: number | null
} {
  let sumPnl = 0
  let sumMargin = 0
  for (const t of trades) {
    sumPnl += t.journal.displayPnl ?? 0
    sumMargin += t.journal.entryVolume ?? 0
  }
  return {
    sumPnl,
    groupRoiPct: sumMargin > 0 ? (sumPnl / sumMargin) * 100 : null,
  }
}

function aggregateExitLegGroup(rows: ExitJournalRow[]): {
  sumPnl: number
  groupRoiPct: number | null
} {
  let sumPnl = 0
  let sumMargin = 0
  for (const { exit } of rows) {
    sumPnl += exit.legJournal.pnl
    sumMargin += exit.volume
  }
  return {
    sumPnl,
    groupRoiPct: sumMargin > 0 ? (sumPnl / sumMargin) * 100 : null,
  }
}

/** Группировка выходов по дате/времени выхода. */
export function groupClosedExitsByPeriod(
  exitRows: ExitJournalRow[],
  mode: JournalGroupMode,
): ClosedExitsGroup[] {
  if (mode === "none") {
    const { sumPnl, groupRoiPct } = aggregateExitLegGroup(exitRows)
    return [{ label: "", rows: exitRows, sumPnl, groupRoiPct }]
  }

  const map = new Map<string, { label: string; items: ExitJournalRow[] }>()

  for (const row of exitRows) {
    const d = new Date(row.exit.timestamp)
    const { key, label } = bucketMeta(d, mode)
    const cur = map.get(key) ?? { label, items: [] }
    cur.items.push(row)
    map.set(key, cur)
  }

  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
  return keys.map((k) => {
    const g = map.get(k)!
    g.items.sort(
      (a, b) =>
        new Date(b.exit.timestamp).getTime() - new Date(a.exit.timestamp).getTime(),
    )
    const { sumPnl, groupRoiPct } = aggregateExitLegGroup(g.items)
    return { label: g.label, rows: g.items, sumPnl, groupRoiPct }
  })
}

/** Группировка закрытых трейдов по дате закрытия (этап 2). */
export function groupClosedTradesByPeriod(
  trades: TradeListItemDto[],
  mode: JournalGroupMode,
): ClosedTradesGroup[] {
  if (mode === "none") {
    const closed = trades.filter((t) => t.status === "CLOSED")
    const { sumPnl, groupRoiPct } = aggregateClosedGroup(closed)
    return [{ label: "", trades, sumPnl, groupRoiPct }]
  }

  const closed = trades.filter((t) => t.status === "CLOSED")
  const map = new Map<string, { label: string; items: TradeListItemDto[] }>()

  for (const t of closed) {
    const raw = t.closedAt ?? t.createdAt
    const d = new Date(raw)
    const { key, label } = bucketMeta(d, mode)
    const cur = map.get(key) ?? { label, items: [] }
    cur.items.push(t)
    map.set(key, cur)
  }

  const keys = [...map.keys()].sort((a, b) => b.localeCompare(a))
  return keys.map((k) => {
    const g = map.get(k)!
    g.items.sort(
      (a, b) =>
        new Date(b.closedAt ?? b.createdAt).getTime() -
        new Date(a.closedAt ?? a.createdAt).getTime(),
    )
    const { sumPnl, groupRoiPct } = aggregateClosedGroup(g.items)
    return { label: g.label, trades: g.items, sumPnl, groupRoiPct }
  })
}
