"use client"

import { useCallback, useEffect, useState, useSyncExternalStore } from "react"
import { useRouter } from "next/navigation"
import type { StrategyDto } from "@/contracts/settings-catalog"
import { settingsListsStore } from "@/features/settings/settings-lists-store"
import {
  deleteAccount,
  deleteEmotion,
  deleteStrategy,
  getAccounts,
  getEmotions,
  getStrategies,
  patchAccount,
  patchEmotion,
  patchStrategy,
  postAccount,
  postEmotion,
  postStrategy,
} from "@/features/settings/api"
import { redirectOn401 } from "@/features/trades/session-expired"

export type SettingsPanelsVariant = "accounts" | "catalogs"

type Props = {
  variant: SettingsPanelsVariant
  authed: boolean
  onCatalogChanged: () => void
}

export function SettingsPanels({ variant, authed, onCatalogChanged }: Props) {
  const router = useRouter()
  const accounts = useSyncExternalStore(
    settingsListsStore.subscribe,
    settingsListsStore.getAccounts,
    settingsListsStore.getServerAccounts,
  )
  const strategies = useSyncExternalStore(
    settingsListsStore.subscribe,
    settingsListsStore.getStrategies,
    settingsListsStore.getServerStrategies,
  )
  const emotions = useSyncExternalStore(
    settingsListsStore.subscribe,
    settingsListsStore.getEmotions,
    settingsListsStore.getServerEmotions,
  )
  const [strategyEditId, setStrategyEditId] = useState<string | null>(null)
  const [strategyDraft, setStrategyDraft] = useState({
    name: "",
    timeframe: "",
    setup: "",
    riskNote: "",
  })
  const [accountEditId, setAccountEditId] = useState<string | null>(null)
  const [accountRenameDraft, setAccountRenameDraft] = useState("")
  const [emotionEditId, setEmotionEditId] = useState<string | null>(null)
  const [emotionDraft, setEmotionDraft] = useState("")

  const reload = useCallback(async () => {
    const gen = settingsListsStore.beginFetch()
    if (variant === "accounts") {
      const a = await getAccounts()
      if (!settingsListsStore.isActiveFetch(gen)) return
      if (a.ok && Array.isArray(a.data?.accounts)) settingsListsStore.setAccounts(a.data.accounts)
      else if (!a.ok && a.status !== 401) console.error("getAccounts:", a.error)
      return
    }
    const [s, e] = await Promise.all([getStrategies(), getEmotions()])
    if (!settingsListsStore.isActiveFetch(gen)) return
    if (s.ok && Array.isArray(s.data?.strategies)) settingsListsStore.setStrategies(s.data.strategies)
    else if (!s.ok && s.status !== 401) console.error("getStrategies:", s.error)
    if (e.ok && Array.isArray(e.data?.emotions)) settingsListsStore.setEmotions(e.data.emotions)
    else if (!e.ok && e.status !== 401) console.error("getEmotions:", e.error)
  }, [variant])

  useEffect(() => {
    if (!authed) return
    void reload()
    return () => {
      settingsListsStore.bumpFetchGen()
    }
  }, [authed, reload])

  async function wrap401<T extends { ok: boolean; status?: number }>(r: T) {
    if (!r.ok && r.status === 401) {
      redirectOn401(router, 401)
    }
    return r
  }

  function startEditStrategy(s: StrategyDto) {
    setStrategyEditId(s.id)
    setStrategyDraft({
      name: s.name,
      timeframe: s.timeframe ?? "",
      setup: s.setup ?? "",
      riskNote: s.riskNote ?? "",
    })
  }

  function cancelEditStrategy() {
    setStrategyEditId(null)
  }

  if (variant === "accounts") {
    return (
      <div className="mt-2">
        <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
          <h2 className="mb-3 text-lg font-medium text-[var(--text-primary)]">Счета</h2>
          <p className="mb-3 text-xs text-[var(--text-secondary)]">
            Активный счёт выбирается в шапке. Новые сделки привязываются к выбранному счёту; старые без
            привязки учитываются на счёте «без привязки».
          </p>
          <form
            className="mb-4 flex flex-wrap items-end gap-2"
            onSubmit={async (e) => {
              e.preventDefault()
              const form = e.currentTarget
              const fd = new FormData(form)
              const name = String(fd.get("name") ?? "").trim()
              if (!name) return
              const r = await postAccount({ name })
              await wrap401(r)
              if (r.ok) {
                form.reset()
                const created = r.data.account
                if (!created?.id) {
                  alert("Некорректный ответ сервера")
                  return
                }
                // Сбрасываем поколение: иначе поздний ответ начального reload() перезапишет список без новой строки.
                settingsListsStore.bumpFetchGen()
                settingsListsStore.updateAccounts((prev) => {
                  if (prev.some((a) => a.id === created.id)) return prev
                  return [...prev, created].sort((a, b) => {
                    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1
                    return a.name.localeCompare(b.name, "ru")
                  })
                })
                onCatalogChanged()
              } else {
                alert(r.error || "Не удалось добавить счёт")
              }
            }}
          >
            <input
              name="name"
              placeholder="Название счёта"
              className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
            />
            <button
              type="submit"
              className="rounded bg-[var(--accent-blue)] px-3 py-1.5 text-sm text-white hover:opacity-90"
            >
              Добавить
            </button>
          </form>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[360px] text-sm">
              <thead>
                <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                  <th className="py-2 pr-2 font-medium">Название</th>
                  <th className="py-2 font-medium">Действия</th>
                </tr>
              </thead>
              <tbody>
                {accounts.map((a) => (
                  <tr key={a.id} className="border-b border-[var(--border)]">
                    <td className="py-2 pr-2 text-[var(--text-primary)]">
                      {accountEditId === a.id ? (
                        <input
                          value={accountRenameDraft}
                          onChange={(e) => setAccountRenameDraft(e.target.value)}
                          className="w-full max-w-xs rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-sm"
                          autoFocus
                        />
                      ) : (
                        <>
                          {a.name}
                          {a.isDefault ? (
                            <span className="ml-2 text-xs text-[var(--text-secondary)]">
                              по умолчанию
                            </span>
                          ) : null}
                        </>
                      )}
                    </td>
                    <td className="py-2">
                      <div className="flex flex-wrap gap-2">
                        {accountEditId === a.id ? (
                          <>
                            <button
                              type="button"
                              className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                              onClick={async () => {
                                const name = accountRenameDraft.trim()
                                if (!name) {
                                  alert("Нужно имя")
                                  return
                                }
                                const r = await patchAccount(a.id, { name })
                                await wrap401(r)
                                if (r.ok) {
                                  setAccountEditId(null)
                                  settingsListsStore.bumpFetchGen()
                                  settingsListsStore.updateAccounts((prev) =>
                                    prev.map((x) => (x.id === a.id ? r.data.account : x)),
                                  )
                                  onCatalogChanged()
                                } else alert(r.error || "Ошибка")
                              }}
                            >
                              Сохранить
                            </button>
                            <button
                              type="button"
                              className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                              onClick={() => setAccountEditId(null)}
                            >
                              Отмена
                            </button>
                          </>
                        ) : (
                          <>
                            {!a.isDefault && (
                              <button
                                type="button"
                                className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                                onClick={async () => {
                                  const r = await patchAccount(a.id, { isDefault: true })
                                  await wrap401(r)
                                  if (r.ok) {
                                    settingsListsStore.bumpFetchGen()
                                    settingsListsStore.updateAccounts((prev) =>
                                      prev.map((x) =>
                                        x.id === a.id
                                          ? r.data.account
                                          : { ...x, isDefault: false },
                                      ),
                                    )
                                    onCatalogChanged()
                                  } else alert(r.error || "Ошибка")
                                }}
                              >
                                Основной
                              </button>
                            )}
                            <button
                              type="button"
                              className="rounded border border-[var(--border)] px-2 py-1 text-xs"
                              onClick={() => {
                                setAccountEditId(a.id)
                                setAccountRenameDraft(a.name)
                              }}
                            >
                              Переименовать
                            </button>
                            {!a.isDefault && (
                              <button
                                type="button"
                                className="rounded border border-[var(--accent-red)] px-2 py-1 text-xs text-[var(--accent-red)]"
                                onClick={async () => {
                                  if (!confirm("Удалить счёт (только если нет сделок)?")) return
                                  const r = await deleteAccount(a.id)
                                  await wrap401(r)
                                  if (r.ok) {
                                    settingsListsStore.bumpFetchGen()
                                    settingsListsStore.updateAccounts((prev) =>
                                      prev.filter((x) => x.id !== a.id),
                                    )
                                    onCatalogChanged()
                                  } else alert(r.error || "Ошибка")
                                }}
                              >
                                Удалить
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="mt-2 space-y-10">
      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 text-lg font-medium text-[var(--text-primary)]">Стратегии</h2>
        <p className="mb-3 text-xs text-[var(--text-secondary)]">
          Справочник для подсказок в форме сделки. Колонки: таймфрейм анализа, сетап входа, заметки по
          риску (стоп, R).
        </p>
        <form
          className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            const fd = new FormData(form)
            const name = String(fd.get("name") ?? "").trim()
            if (!name) return
            const r = await postStrategy({
              name,
              timeframe: String(fd.get("timeframe") ?? "").trim() || null,
              setup: String(fd.get("setup") ?? "").trim() || null,
              riskNote: String(fd.get("riskNote") ?? "").trim() || null,
            })
            await wrap401(r)
            if (r.ok) {
              form.reset()
              const created = r.data.strategy
              if (!created?.id) {
                alert("Некорректный ответ сервера")
                return
              }
              settingsListsStore.bumpFetchGen()
              settingsListsStore.updateStrategies((prev) => {
                if (prev.some((s) => s.id === created.id)) return prev
                return [...prev, created].sort(
                  (a, b) =>
                    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"),
                )
              })
            } else alert(r.error || "Не удалось добавить стратегию")
          }}
        >
          <input
            name="name"
            placeholder="Название"
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          />
          <input
            name="timeframe"
            placeholder="Таймфрейм (1H, 4H…)"
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          />
          <input
            name="setup"
            placeholder="Сетап / правило входа"
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          />
          <input
            name="riskNote"
            placeholder="Риск: стоп, R"
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm text-[var(--text-primary)]"
          />
          <div className="sm:col-span-2 lg:col-span-4">
            <button
              type="submit"
              className="rounded bg-[var(--accent-blue)] px-3 py-1.5 text-sm text-white hover:opacity-90"
            >
              Добавить стратегию
            </button>
          </div>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
                <th className="py-2 pr-2 font-medium">Название</th>
                <th className="py-2 pr-2 font-medium">Таймфрейм</th>
                <th className="py-2 pr-2 font-medium">Сетап</th>
                <th className="py-2 pr-2 font-medium">Риск / стоп</th>
                <th className="py-2 font-medium">Действия</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)]">
                  {strategyEditId === s.id ? (
                    <>
                      <td className="py-2 pr-2">
                        <input
                          value={strategyDraft.name}
                          onChange={(e) =>
                            setStrategyDraft((d) => ({ ...d, name: e.target.value }))
                          }
                          className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[var(--text-primary)]"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={strategyDraft.timeframe}
                          onChange={(e) =>
                            setStrategyDraft((d) => ({ ...d, timeframe: e.target.value }))
                          }
                          className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[var(--text-primary)]"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={strategyDraft.setup}
                          onChange={(e) =>
                            setStrategyDraft((d) => ({ ...d, setup: e.target.value }))
                          }
                          className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[var(--text-primary)]"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={strategyDraft.riskNote}
                          onChange={(e) =>
                            setStrategyDraft((d) => ({ ...d, riskNote: e.target.value }))
                          }
                          className="w-full rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-[var(--text-primary)]"
                        />
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-xs text-[var(--accent-blue)]"
                            onClick={async () => {
                              const name = strategyDraft.name.trim()
                              if (!name) {
                                alert("Нужно название")
                                return
                              }
                              const r = await patchStrategy(s.id, {
                                name,
                                timeframe: strategyDraft.timeframe.trim() || null,
                                setup: strategyDraft.setup.trim() || null,
                                riskNote: strategyDraft.riskNote.trim() || null,
                              })
                              await wrap401(r)
                              if (r.ok) {
                                cancelEditStrategy()
                                await reload()
                              } else alert(r.error || "Ошибка")
                            }}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            className="text-xs text-[var(--text-secondary)]"
                            onClick={cancelEditStrategy}
                          >
                            Отмена
                          </button>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="py-2 pr-2 text-[var(--text-primary)]">{s.name}</td>
                      <td className="max-w-[120px] truncate py-2 pr-2" title={s.timeframe ?? ""}>
                        {s.timeframe ?? "—"}
                      </td>
                      <td className="max-w-[160px] truncate py-2 pr-2" title={s.setup ?? ""}>
                        {s.setup ?? "—"}
                      </td>
                      <td className="max-w-[160px] truncate py-2 pr-2" title={s.riskNote ?? ""}>
                        {s.riskNote ?? "—"}
                      </td>
                      <td className="py-2">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="text-xs text-[var(--accent-blue)]"
                            onClick={() => startEditStrategy(s)}
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            className="text-xs text-[var(--accent-red)]"
                            onClick={async () => {
                              if (!confirm("Удалить стратегию из справочника?")) return
                              const r = await deleteStrategy(s.id)
                              await wrap401(r)
                              if (r.ok) await reload()
                              else alert(r.error || "Ошибка")
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-4">
        <h2 className="mb-3 text-lg font-medium text-[var(--text-primary)]">Эмоции</h2>
        <form
          className="mb-4 flex flex-wrap gap-2"
          onSubmit={async (e) => {
            e.preventDefault()
            const form = e.currentTarget
            const fd = new FormData(form)
            const name = String(fd.get("name") ?? "").trim()
            if (!name) return
            const r = await postEmotion({ name })
            await wrap401(r)
            if (r.ok) {
              form.reset()
              const created = r.data.emotion
              if (!created?.id) {
                alert("Некорректный ответ сервера")
                return
              }
              settingsListsStore.bumpFetchGen()
              settingsListsStore.updateEmotions((prev) => {
                if (prev.some((x) => x.id === created.id)) return prev
                return [...prev, created].sort(
                  (a, b) =>
                    a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, "ru"),
                )
              })
            } else alert(r.error || "Не удалось добавить эмоцию")
          }}
        >
          <input
            name="name"
            placeholder="Напр. Спокойствие, FOMO"
            className="rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1.5 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-[var(--accent-blue)] px-3 py-1.5 text-sm text-white hover:opacity-90"
          >
            Добавить
          </button>
        </form>
        <ul className="space-y-1 text-sm">
          {emotions.map((em) => (
            <li
              key={em.id}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] py-1.5"
            >
              {emotionEditId === em.id ? (
                <input
                  value={emotionDraft}
                  onChange={(e) => setEmotionDraft(e.target.value)}
                  className="min-w-[8rem] flex-1 rounded border border-[var(--border)] bg-[var(--surface-elevated)] px-2 py-1 text-sm"
                  autoFocus
                />
              ) : (
                <span>{em.name}</span>
              )}
              <div className="flex gap-2">
                {emotionEditId === em.id ? (
                  <>
                    <button
                      type="button"
                      className="text-xs text-[var(--accent-blue)]"
                      onClick={async () => {
                        const name = emotionDraft.trim()
                        if (!name) {
                          alert("Нужно имя")
                          return
                        }
                        const r = await patchEmotion(em.id, { name })
                        await wrap401(r)
                        if (r.ok) {
                          setEmotionEditId(null)
                          settingsListsStore.bumpFetchGen()
                          settingsListsStore.updateEmotions((prev) =>
                            prev.map((x) => (x.id === em.id ? r.data.emotion : x)),
                          )
                        } else alert(r.error || "Ошибка")
                      }}
                    >
                      Сохр.
                    </button>
                    <button
                      type="button"
                      className="text-xs text-[var(--text-secondary)]"
                      onClick={() => setEmotionEditId(null)}
                    >
                      Отм.
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      className="text-xs text-[var(--accent-blue)]"
                      onClick={() => {
                        setEmotionEditId(em.id)
                        setEmotionDraft(em.name)
                      }}
                    >
                      Изм.
                    </button>
                    <button
                      type="button"
                      className="text-xs text-[var(--accent-red)]"
                      onClick={async () => {
                        if (!confirm("Удалить эмоцию из справочника?")) return
                        const r = await deleteEmotion(em.id)
                        await wrap401(r)
                        if (r.ok) {
                          settingsListsStore.bumpFetchGen()
                          settingsListsStore.updateEmotions((prev) =>
                            prev.filter((x) => x.id !== em.id),
                          )
                        } else alert(r.error || "Ошибка")
                      }}
                    >
                      Удалить
                    </button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
