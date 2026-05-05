"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import type { TrashItemDto } from "@/contracts/trades"
import { getTrash, postRestore } from "@/features/trades/api"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import { redirectOn401 } from "@/features/trades/session-expired"

export default function TrashPage() {
  const router = useRouter()
  const gate = useProtectedPageSession()
  const authed = gate === "authed"
  const [data, setData] = useState<TrashItemDto | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await getTrash()
    if (!r.ok) {
      redirectOn401(router, r.status)
      setData({ deletedTrades: [], deletedExits: [] })
      setLoading(false)
      return
    }
    setData(r.data)
    setLoading(false)
  }, [router])

  useEffect(() => {
    if (!authed) return
    void load()
  }, [authed, load])

  async function restoreTrade(tradeId: string) {
    const res = await postRestore({ tradeId })
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) alert(res.error ?? "Ошибка восстановления")
      return
    }
    void load()
  }

  async function restoreExit(exitId: string) {
    const res = await postRestore({ exitId })
    if (!res.ok) {
      redirectOn401(router, res.status)
      if (res.status !== 401) alert(res.error ?? "Ошибка восстановления")
      return
    }
    void load()
  }

  if (gate === "loading" || (authed && loading && data === null)) {
    return <div className="text-gray-400">Загрузка…</div>
  }
  if (gate === "guest") {
    return null
  }

  const trades = data?.deletedTrades ?? []
  const exits = data?.deletedExits ?? []

  return (
    <div className="text-white">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Корзина</h1>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700"
          >
            Обновить
          </button>
          <Link href="/dashboard" className="rounded bg-gray-800 px-3 py-1.5 text-sm hover:bg-gray-700">
            К открытым
          </Link>
        </div>
      </div>
      <p className="mb-6 text-sm text-gray-400">
        Удалённые трейды и отдельные выходы. Восстановление возвращает их в журнал.
      </p>

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-medium text-gray-200">Трейды</h2>
        {trades.length === 0 ? (
          <p className="text-sm text-gray-500">Пусто</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {trades.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-800 bg-[#111] px-3 py-2"
              >
                <span>
                  {t.symbol} · {t.direction} · {t.status}
                  {t.deletedAt ? (
                    <span className="ml-2 text-xs text-gray-500">
                      удалён {new Date(t.deletedAt).toLocaleString()}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => void restoreTrade(t.id)}
                  className="rounded bg-blue-700 px-2 py-1 text-xs hover:bg-blue-600"
                >
                  Восстановить трейд
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-medium text-gray-200">Сделки (выходы)</h2>
        {exits.length === 0 ? (
          <p className="text-sm text-gray-500">Пусто</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {exits.map((x) => (
              <li
                key={x.exit.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-gray-800 bg-[#111] px-3 py-2"
              >
                <span>
                  {x.trade.symbol} · выход {x.exit.id.slice(0, 8)}… · {x.exit.price} @{" "}
                  {new Date(x.exit.timestamp).toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => void restoreExit(x.exit.id)}
                  className="rounded bg-blue-700 px-2 py-1 text-xs hover:bg-blue-600"
                >
                  Восстановить выход
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
