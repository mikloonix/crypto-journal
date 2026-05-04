"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut, useSession } from "next-auth/react"

export function AppHeader() {
  const { data: session, status } = useSession()
  const pathname = usePathname()

  /** На экране входа меню не показываем, даже если сессия ещё считается активной. */
  const hideNavForPath = pathname === "/login" || pathname.startsWith("/login/")
  const showNav = status === "authenticated" && !hideNavForPath

  return (
    <header className="border-b border-gray-900 bg-black/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-4 md:gap-6">
          <Link href={showNav ? "/dashboard" : "/login"} className="shrink-0 font-semibold">
            Crypto Journal
          </Link>
          {showNav && (
            <nav className="flex flex-wrap gap-3 text-sm text-gray-300">
              <Link className="hover:text-white" href="/portfolio">
                Портфель
              </Link>
              <Link className="hover:text-white" href="/dashboard">
                Открытые
              </Link>
              <Link className="hover:text-white" href="/trades/closed">
                Закрытые
              </Link>
              <Link className="hover:text-white" href="/analytics">
                Аналитика
              </Link>
              <Link className="hover:text-white" href="/risk">
                Риск
              </Link>
              <Link className="hover:text-white" href="/settings">
                Настройки
              </Link>
            </nav>
          )}
        </div>
        {showNav && (
          <div className="flex shrink-0 items-center gap-3 text-sm text-gray-400">
            <span className="max-w-[200px] truncate md:max-w-none" title={session?.user?.email ?? ""}>
              {session?.user?.email}
            </span>
            <button
              type="button"
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="rounded bg-gray-800 px-3 py-1.5 text-white hover:bg-gray-700"
            >
              Выйти
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
