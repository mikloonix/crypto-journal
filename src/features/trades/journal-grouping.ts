import { endOfMonth, endOfWeek, startOfDay, startOfMonth, startOfWeek } from "date-fns"
import type { TradeListItemDto } from "@/contracts/trades"

export type JournalGroupMode = "none" | "day" | "week" | "month"

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

/** Группировка закрытых трейдов по дате закрытия (этап 2). */
export function groupClosedTradesByPeriod(
  trades: TradeListItemDto[],
  mode: JournalGroupMode,
): { label: string; trades: TradeListItemDto[] }[] {
  if (mode === "none") return [{ label: "", trades }]

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
    return { label: g.label, trades: g.items }
  })
}
