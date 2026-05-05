"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

const items = [
  { href: "/settings", label: "Торговые параметры", match: (p: string) => p === "/settings" },
  {
    href: "/settings/accounts",
    label: "Счета",
    match: (p: string) => p === "/settings/accounts" || p.startsWith("/settings/accounts/"),
  },
  {
    href: "/settings/catalogs",
    label: "Справочники",
    match: (p: string) => p === "/settings/catalogs" || p.startsWith("/settings/catalogs/"),
  },
  {
    href: "/settings/trash",
    label: "Корзина",
    match: (p: string) => p === "/settings/trash" || p.startsWith("/settings/trash/"),
  },
] as const

export function SettingsSubnav() {
  const pathname = usePathname()

  return (
    <nav className="mb-6 flex flex-wrap gap-2 text-sm" aria-label="Разделы настроек">
      {items.map(({ href, label, match }) => {
        const active = match(pathname)
        return (
          <Link
            key={href}
            href={href}
            className={`rounded border px-3 py-1.5 ${
              active
                ? "border-[var(--accent-blue)] bg-[var(--surface)] text-[var(--text-primary)]"
                : "border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--accent-blue)] hover:text-[var(--text-primary)]"
            }`}
          >
            {label}
          </Link>
        )
      })}
    </nav>
  )
}
