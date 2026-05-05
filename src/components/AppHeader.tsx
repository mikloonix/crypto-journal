"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"
import { useState } from "react"
import { Menu, X } from "lucide-react"
import {
  HEADER_ALL_ACCOUNTS_VALUE,
  useActiveAccount,
} from "@/features/trades/active-account-context"

const nav = [
  { href: "/portfolio", label: "Портфель" },
  { href: "/dashboard", label: "Открытые" },
  { href: "/trades/closed", label: "Закрытые" },
  { href: "/analytics", label: "Аналитика" },
  { href: "/risk", label: "Риск" },
  { href: "/settings", label: "Настройки" },
] as const

function AccountSelect() {
  const activeAccount = useActiveAccount()

  if (!activeAccount.ready) {
    return (
      <span className="truncate text-xs text-[var(--text-secondary)] sm:text-sm">Счёт: …</span>
    )
  }

  if (activeAccount.accounts.length === 0) {
    return (
      <Link
        href="/settings/accounts"
        className="truncate text-xs text-[var(--accent-blue)] hover:underline sm:text-sm"
      >
        Добавить счёт
      </Link>
    )
  }

  const current =
    activeAccount.accounts.find((a) => a.id === activeAccount.resolvedActiveAccountId) ?? null

  const selectValue = activeAccount.journalAllAccounts
    ? HEADER_ALL_ACCOUNTS_VALUE
    : (activeAccount.resolvedActiveAccountId ?? "")

  return (
    <select
      value={selectValue}
      onChange={(e) => {
        void activeAccount.selectAccountInHeader(e.target.value)
      }}
      title={
        activeAccount.journalAllAccounts
          ? "Все счета в журнале"
          : current
            ? `Текущий счёт: ${current.name}`
            : "Счёт"
      }
      aria-label="Выбор счёта"
      className="min-w-0 max-w-[200px] flex-1 truncate rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-xs text-[var(--text-primary)] sm:max-w-[240px] sm:text-sm"
    >
      <option value={HEADER_ALL_ACCOUNTS_VALUE}>Все счета</option>
      {activeAccount.accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.isDefault ? `${a.name} (по умолч.)` : a.name}
        </option>
      ))}
    </select>
  )
}

export function AppHeader() {
  const { data: session, status } = useSession()
  const pathname = usePathname()
  const [mobileOpen, setMobileOpen] = useState(false)

  const hideNavForPath = pathname === "/login" || pathname.startsWith("/login/")
  const showNav = status === "authenticated" && !hideNavForPath

  return (
    <header className="border-b border-[var(--border)] bg-[var(--surface)]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2 sm:gap-4 md:gap-6">
          <Link
            href={showNav ? "/dashboard" : "/login"}
            className="shrink-0 font-semibold text-[var(--text-primary)]"
          >
            Crypto Journal
          </Link>

          {showNav && (
            <label className="flex min-w-0 max-w-[min(260px,42vw)] shrink items-center gap-1.5 sm:max-w-[280px] sm:gap-2 md:max-w-none">
              <span className="shrink-0 text-xs text-[var(--text-secondary)] sm:text-sm">
                Счёт
              </span>
              <AccountSelect />
            </label>
          )}

          {showNav && (
            <nav className="hidden flex-wrap gap-4 text-sm text-[var(--text-secondary)] lg:flex">
              {nav.map(({ href, label }) => {
                const active =
                  href === "/settings"
                    ? pathname.startsWith("/settings")
                    : pathname === href || pathname.startsWith(href + "/")
                return (
                  <Link
                    key={href}
                    href={href}
                    className={
                      active
                        ? "font-medium text-[var(--accent-blue)]"
                        : "hover:text-[var(--text-primary)]"
                    }
                  >
                    {label}
                  </Link>
                )
              })}
            </nav>
          )}
        </div>

        {showNav && (
          <div className="flex shrink-0 items-center gap-2 md:gap-3">
            <button
              type="button"
              className="inline-flex rounded border border-[var(--border)] p-2 text-[var(--text-primary)] lg:hidden"
              aria-expanded={mobileOpen}
              aria-label={mobileOpen ? "Закрыть меню" : "Открыть меню"}
              onClick={() => setMobileOpen((o) => !o)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <span
              className="hidden max-w-[200px] truncate text-sm text-[var(--text-secondary)] md:inline"
              title={session?.user?.email ?? ""}
            >
              {session?.user?.email}
            </span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded bg-[var(--surface-elevated)] px-3 py-1.5 text-sm text-[var(--text-primary)] hover:opacity-90"
            >
              Выйти
            </button>
          </div>
        )}
      </div>

      {showNav && mobileOpen && (
        <div className="border-t border-[var(--border)] bg-[var(--surface)] px-4 py-3 lg:hidden">
          <nav className="flex flex-col gap-2 text-sm">
            {nav.map(({ href, label }) => {
              const active =
                href === "/settings"
                  ? pathname.startsWith("/settings")
                  : pathname === href || pathname.startsWith(href + "/")
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setMobileOpen(false)}
                  className={
                    active
                      ? "font-medium text-[var(--accent-blue)]"
                      : "text-[var(--text-secondary)]"
                  }
                >
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>
      )}
    </header>
  )
}
