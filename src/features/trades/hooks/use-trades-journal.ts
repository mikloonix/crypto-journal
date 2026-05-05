"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import type { JournalSummaryDto, TradeListItemDto } from "@/contracts/trades"
import { getTradesJournal } from "@/features/trades/api"
import { redirectOn401 } from "@/features/trades/session-expired"

function stableQueryKey(listQuery: Record<string, string> | undefined): string {
  if (listQuery == null) return "__all__"
  const entries = Object.entries(listQuery)
    .filter(([, v]) => v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
  return JSON.stringify(Object.fromEntries(entries))
}

export function useTradesJournal(authed: boolean, listQuery?: Record<string, string>) {
  const router = useRouter()
  const [trades, setTrades] = useState<TradeListItemDto[]>([])
  const [summary, setSummary] = useState<JournalSummaryDto | null>(null)
  const queryKey = useMemo(() => stableQueryKey(listQuery), [listQuery])

  const refresh = useCallback(async (): Promise<boolean> => {
    const r = await getTradesJournal(listQuery)
    if (!r.ok) {
      redirectOn401(router, r.status)
      return false
    }
    setTrades(r.data.trades)
    setSummary(r.data.summary)
    return true
  }, [router, listQuery])

  useEffect(() => {
    if (!authed) return
    let cancelled = false
    void (async () => {
      const r = await getTradesJournal(listQuery)
      if (cancelled) return
      if (!r.ok) {
        redirectOn401(router, r.status)
        return
      }
      setTrades(r.data.trades)
      setSummary(r.data.summary)
    })()
    return () => {
      cancelled = true
    }
  }, [authed, router, queryKey, listQuery])

  return { trades, setTrades, summary, setSummary, refresh }
}
