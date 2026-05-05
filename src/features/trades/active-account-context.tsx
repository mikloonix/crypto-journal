"use client"

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react"
import { useSession } from "next-auth/react"
import type { AccountDto } from "@/contracts/settings-catalog"
import { getTradingDefaults, patchTradingDefaults } from "@/features/trades/api"
import { getAccounts } from "@/features/settings/api"
import { settingsListsStore } from "@/features/settings/settings-lists-store"

export const HEADER_ALL_ACCOUNTS_VALUE = "__ALL__"

export type ActiveAccountContextValue = {
  ready: boolean
  accounts: AccountDto[]
  activeAccountId: string | null
  journalAllAccounts: boolean
  /** Актуальный счёт для журнала и форм (если в БД битый id — подставляется основной). */
  resolvedActiveAccountId: string | null
  /** Выбор в шапке: все счета или конкретный id. */
  selectAccountInHeader: (value: string) => Promise<boolean>
  refresh: () => Promise<void>
}

const ActiveAccountContext = createContext<ActiveAccountContextValue | null>(null)

export function ActiveAccountProvider({ children }: { children: ReactNode }) {
  const { status } = useSession()
  const [ready, setReady] = useState(false)
  const [accounts, setAccounts] = useState<AccountDto[]>([])
  const [activeAccountId, setActiveId] = useState<string | null>(null)
  const [journalAllAccounts, setJournalAllAccounts] = useState(false)

  const refresh = useCallback(async () => {
    if (status !== "authenticated") return

    let list: AccountDto[] = []
    let ar = await getAccounts()
    if (ar.ok && Array.isArray(ar.data?.accounts)) {
      list = ar.data.accounts
    }
    if (ar.ok && list.length === 0) {
      await new Promise((r) => setTimeout(r, 300))
      ar = await getAccounts()
      if (ar.ok && Array.isArray(ar.data?.accounts)) {
        list = ar.data.accounts
      }
    }
    if (ar.ok) {
      setAccounts(list)
    }

    let r = await getTradingDefaults()
    if (r.ok && list.length > 0) {
      const pick = list.find((a) => a.isDefault)?.id ?? list[0]!.id
      const serverId = r.data.activeAccountId
      const valid = serverId != null && list.some((a) => a.id === serverId)
      if (!valid || !serverId) {
        const p = await patchTradingDefaults({ activeAccountId: pick })
        if (p.ok) r = p
      }
    }
    if (r.ok) {
      setActiveId(r.data.activeAccountId ?? null)
      setJournalAllAccounts(Boolean(r.data.journalAllAccounts))
    } else if (list.length > 0) {
      setActiveId(list.find((a) => a.isDefault)?.id ?? list[0]!.id)
    }
  }, [status])

  useEffect(() => {
    if (status !== "authenticated") {
      setReady(false)
      setAccounts([])
      setActiveId(null)
      setJournalAllAccounts(false)
      if (status === "unauthenticated") {
        settingsListsStore.reset()
      }
      return
    }
    let cancelled = false
    void (async () => {
      await refresh()
      if (!cancelled) setReady(true)
    })()
    return () => {
      cancelled = true
    }
  }, [status, refresh])

  const selectAccountInHeader = useCallback(async (value: string) => {
    if (value === HEADER_ALL_ACCOUNTS_VALUE) {
      const res = await patchTradingDefaults({ journalAllAccounts: true })
      if (!res.ok) return false
      setJournalAllAccounts(Boolean(res.data.journalAllAccounts))
      setActiveId(res.data.activeAccountId ?? null)
      return true
    }
    const res = await patchTradingDefaults({
      activeAccountId: value,
      journalAllAccounts: false,
    })
    if (!res.ok) return false
    setJournalAllAccounts(Boolean(res.data.journalAllAccounts))
    setActiveId(res.data.activeAccountId ?? null)
    return true
  }, [])

  const resolvedActiveAccountId = useMemo(() => {
    if (accounts.length > 0) {
      if (activeAccountId && accounts.some((a) => a.id === activeAccountId)) {
        return activeAccountId
      }
      return accounts.find((a) => a.isDefault)?.id ?? accounts[0]!.id
    }
    if (activeAccountId) {
      return activeAccountId
    }
    return null
  }, [accounts, activeAccountId])

  const value = useMemo(
    () => ({
      ready,
      accounts,
      activeAccountId,
      journalAllAccounts,
      resolvedActiveAccountId,
      selectAccountInHeader,
      refresh,
    }),
    [
      ready,
      accounts,
      activeAccountId,
      journalAllAccounts,
      resolvedActiveAccountId,
      selectAccountInHeader,
      refresh,
    ],
  )

  return (
    <ActiveAccountContext.Provider value={value}>{children}</ActiveAccountContext.Provider>
  )
}

export function useActiveAccount(): ActiveAccountContextValue {
  const ctx = useContext(ActiveAccountContext)
  if (!ctx) {
    throw new Error("useActiveAccount must be used within ActiveAccountProvider")
  }
  return ctx
}
