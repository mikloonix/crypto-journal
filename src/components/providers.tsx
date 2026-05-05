"use client"

import { SessionProvider } from "next-auth/react"
import type { ReactNode } from "react"
import { ActiveAccountProvider } from "@/features/trades/active-account-context"

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider refetchOnWindowFocus={false} refetchWhenOffline={false}>
      <ActiveAccountProvider>{children}</ActiveAccountProvider>
    </SessionProvider>
  )
}
