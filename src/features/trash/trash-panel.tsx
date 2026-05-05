"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { TrashItemDto } from "@/contracts/trades"
import { getTrash, postRestore } from "@/features/trades/api"
import { redirectOn401 } from "@/features/trades/session-expired"

type Props = {
  authed: boolean
}

export function TrashPanel({ authed }: Props) {
  const router = useRouter()
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

  if (authed && loading && data === null) {
    return <div className="text-[var(--text-secondary)]">Загрузка…</div>
  }

  const trades = data?.deletedTrades ?? []
  const exits = data?.deletedExits ?? []

  return (
    <div className="text-[var(--text-primary)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Корзина</h2>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-3 py-1.5 text-sm hover:opacity-90"
          >
            Обновить
          </button>
        </div>
      </div>
      <p className="mb-6 text-sm text-[var(--text-secondary)]">
        Удалённые трейды и отдельные выходы. Восстановление возвращает их в журнал.
      </p>

      <section className="mb-10">
        <h3 className="mb-2 text-lg font-medium">Трейды</h3>
        {trades.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Пусто</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {trades.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              >
                <span>
                  {t.symbol} · {t.direction} · {t.status}
                  {t.deletedAt ? (
                    <span className="ml-2 text-xs text-[var(--text-secondary)]">
                      удалён {new Date(t.deletedAt).toLocaleString()}
                    </span>
                  ) : null}
                </span>
                <button
                  type="button"
                  onClick={() => void restoreTrade(t.id)}
                  className="rounded bg-[var(--accent-blue)] px-2 py-1 text-xs text-white hover:opacity-90"
                >
                  Восстановить трейд
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="mb-2 text-lg font-medium">Сделки (выходы)</h3>
        {exits.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">Пусто</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {exits.map((x) => (
              <li
                key={x.exit.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded border border-[var(--border)] bg-[var(--surface)] px-3 py-2"
              >
                <span>
                  {x.trade.symbol} · выход {x.exit.id.slice(0, 8)}… · {x.exit.price} @{" "}
                  {new Date(x.exit.timestamp).toLocaleString()}
                </span>
                <button
                  type="button"
                  onClick={() => void restoreExit(x.exit.id)}
                  className="rounded bg-[var(--accent-blue)] px-2 py-1 text-xs text-white hover:opacity-90"
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
