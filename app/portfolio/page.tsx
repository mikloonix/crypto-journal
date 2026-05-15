"use client"

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react"
import type { CashflowDto, CashflowListResponseDto } from "@/contracts/cashflow"
import type { AccountDto } from "@/contracts/settings-catalog"
import { deleteCashflow, getCashflows, patchCashflow, postCashflow } from "@/features/portfolio/api"
import { getAccounts } from "@/features/settings/api"
import { useActiveAccount } from "@/features/trades/active-account-context"
import { useProtectedPageSession } from "@/features/trades/hooks/use-protected-page-session"
import { redirectOn401 } from "@/features/trades/session-expired"
import { formatInQuote } from "@/lib/format-amount"
import { useRouter } from "next/navigation"

function typeLabel(t: CashflowDto["type"]): string {
  switch (t) {
    case "DEPOSIT":
      return "Пополнение"
    case "WITHDRAWAL":
      return "Вывод"
    case "TRANSFER":
      return "Перевод"
    default:
      return t
  }
}

function accountLabel(accounts: AccountDto[], id: string | null): string {
  if (!id) return "—"
  return accounts.find((a) => a.id === id)?.name ?? id.slice(0, 8)
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso)
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
  return d.toISOString().slice(0, 16)
}

const emptyForm = () => ({
  opType: "DEPOSIT" as const,
  accountId: "",
  fromAccountId: "",
  toAccountId: "",
  amount: "",
  currency: "USDT",
  fxRate: "",
  fee: "",
  note: "",
  timestampLocal: toDatetimeLocalValue(new Date().toISOString()),
})

export default function PortfolioPage() {
  const router = useRouter()
  const gate = useProtectedPageSession()
  const authed = gate === "authed"
  const { journalAllAccounts, resolvedActiveAccountId, ready: accountReady } = useActiveAccount()

  const [accounts, setAccounts] = useState<AccountDto[]>([])
  const [rows, setRows] = useState<CashflowDto[]>([])
  const [summary, setSummary] = useState<CashflowListResponseDto["summary"] | null>(null)
  const [loading, setLoading] = useState(true)
  const [formError, setFormError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)

  const defaultRange = useMemo(() => {
    const to = new Date()
    const from = new Date()
    from.setUTCDate(from.getUTCDate() - 90)
    return {
      from: from.toISOString(),
      to: to.toISOString(),
    }
  }, [])

  const [fromIso, setFromIso] = useState(defaultRange.from)
  const [toIso, setToIso] = useState(defaultRange.to)

  const [opType, setOpType] = useState<"DEPOSIT" | "WITHDRAWAL" | "TRANSFER">("DEPOSIT")
  const [accountId, setAccountId] = useState("")
  const [fromAccountId, setFromAccountId] = useState("")
  const [toAccountId, setToAccountId] = useState("")
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState("USDT")
  const [fxRate, setFxRate] = useState("")
  const [fee, setFee] = useState("")
  const [note, setNote] = useState("")
  const [timestampLocal, setTimestampLocal] = useState(() => {
    const d = new Date()
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset())
    return d.toISOString().slice(0, 16)
  })

  const refresh = useCallback(async () => {
    const r = await getCashflows({ from: fromIso, to: toIso })
    if (!r.ok) {
      redirectOn401(router, r.status)
      return false
    }
    setRows(r.data.cashflows)
    setSummary(r.data.summary)
    return true
  }, [router, fromIso, toIso])

  useEffect(() => {
    if (!authed) return
    void getAccounts().then((r) => {
      if (r.ok) setAccounts(r.data.accounts)
    })
  }, [authed])

  useEffect(() => {
    if (!authed || !accountReady) return
    let cancelled = false
    setLoading(true)
    void (async () => {
      const ok = await refresh()
      if (!cancelled && ok) setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [authed, accountReady, refresh])

  const scopeHint = journalAllAccounts
    ? "Все счета"
    : resolvedActiveAccountId
      ? `Счёт: ${accountLabel(accounts, resolvedActiveAccountId)}`
      : "Счёт не выбран"

  function resetFormFields() {
    const f = emptyForm()
    setEditingId(null)
    setOpType(f.opType)
    setAccountId(f.accountId)
    setFromAccountId(f.fromAccountId)
    setToAccountId(f.toAccountId)
    setAmount(f.amount)
    setCurrency(f.currency)
    setFxRate(f.fxRate)
    setFee(f.fee)
    setNote(f.note)
    setTimestampLocal(f.timestampLocal)
  }

  function startEdit(row: CashflowDto) {
    setEditingId(row.id)
    setOpType(row.type)
    setAccountId(row.accountId ?? "")
    setFromAccountId(row.fromAccountId ?? "")
    setToAccountId(row.toAccountId ?? "")
    setAmount(String(row.amount))
    setCurrency(row.currency)
    setFxRate(row.fxRate != null ? String(row.fxRate) : "")
    setFee(row.fee != null ? String(row.fee) : "")
    setNote(row.note ?? "")
    setTimestampLocal(toDatetimeLocalValue(row.timestamp))
    setFormError(null)
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setFormError(null)
    const amt = Number(amount)
    if (!Number.isFinite(amt) || amt <= 0) {
      setFormError("Сумма должна быть > 0")
      return
    }
    const ts = new Date(timestampLocal)
    if (!Number.isFinite(ts.getTime())) {
      setFormError("Некорректная дата")
      return
    }
    const body: Record<string, unknown> = {
      type: opType,
      amount: amt,
      currency: currency.trim() || "USDT",
      timestamp: ts.toISOString(),
    }
    if (fee.trim() !== "") {
      const f = Number(fee)
      if (Number.isFinite(f) && f >= 0) body.fee = f
    } else if (editingId) {
      body.fee = null
    }
    body.note = note.trim() ? note.trim() : null
    const cur = (currency.trim() || "USDT").toUpperCase()
    if (cur !== "USDT") {
      const fx = Number(fxRate)
      if (!Number.isFinite(fx) || fx <= 0) {
        setFormError("Для не-USDT укажите курс к USDT (fxRate > 0)")
        return
      }
      body.fxRate = fx
    } else if (editingId) {
      body.fxRate = null
    }

    if (opType === "DEPOSIT" || opType === "WITHDRAWAL") {
      if (!accountId) {
        setFormError("Выберите счёт")
        return
      }
      body.accountId = accountId
    } else {
      if (!fromAccountId || !toAccountId) {
        setFormError("Выберите счета отправителя и получателя")
        return
      }
      if (fromAccountId === toAccountId) {
        setFormError("Счета должны различаться")
        return
      }
      body.fromAccountId = fromAccountId
      body.toAccountId = toAccountId
    }

    const r = editingId
      ? await patchCashflow(editingId, body)
      : await postCashflow(body)
    if (!r.ok) {
      setFormError(r.error ?? "Ошибка")
      return
    }
    resetFormFields()
    await refresh()
  }

  async function onDelete(id: string) {
    if (!confirm("Удалить операцию?")) return
    const r = await deleteCashflow(id)
    if (!r.ok) {
      redirectOn401(router, r.status)
      return
    }
    await refresh()
  }

  if (gate === "loading") {
    return <div className="text-[var(--text-secondary)]">Загрузка…</div>
  }
  if (gate === "guest") {
    return null
  }

  return (
    <div className="text-[var(--text-primary)]">
      <h1 className="mb-2 text-2xl font-semibold">Портфель</h1>
      <p className="mb-4 text-sm text-[var(--text-secondary)]">
        Cashflow в скоупе журнала: {scopeHint}. Отчёт в USDT.
      </p>

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--text-secondary)]">Net за период</p>
          <p className="text-xl font-medium tabular-nums">
            {summary == null
              ? "—"
              : formatInQuote(summary.netFlowPeriodUsdt, "USDT")}
          </p>
        </div>
        <div className="rounded-xl bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--text-secondary)]">Оценка баланса (скоуп)</p>
          <p className="text-xl font-medium tabular-nums">
            {summary == null ? "—" : formatInQuote(summary.balanceEstimateUsdt, "USDT")}
          </p>
        </div>
        <div className="rounded-xl bg-[var(--surface)] p-4">
          <p className="text-sm text-[var(--text-secondary)]">PnL закрытых (скоуп)</p>
          <p className="text-xl font-medium tabular-nums">
            {summary == null ? "—" : formatInQuote(summary.totalPnlClosedUsdt, "USDT")}
          </p>
        </div>
      </div>

      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">С</span>
          <input
            type="datetime-local"
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text-primary)]"
            value={fromIso.slice(0, 16)}
            onChange={(e) => {
              const d = new Date(e.target.value)
              setFromIso(Number.isFinite(d.getTime()) ? d.toISOString() : fromIso)
            }}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-[var(--text-secondary)]">По</span>
          <input
            type="datetime-local"
            className="rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[var(--text-primary)]"
            value={toIso.slice(0, 16)}
            onChange={(e) => {
              const d = new Date(e.target.value)
              setToIso(Number.isFinite(d.getTime()) ? d.toISOString() : toIso)
            }}
          />
        </label>
        <button
          type="button"
          className="rounded-lg bg-[var(--accent-blue)] px-4 py-2 text-sm font-medium text-white"
          onClick={() => void refresh()}
        >
          Применить
        </button>
      </div>

      <div className="mb-8 rounded-xl bg-[var(--surface)] p-4">
        <h2 className="mb-3 text-lg font-medium">
          {editingId ? "Редактировать операцию" : "Новая операция"}
        </h2>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">Тип</span>
            <select
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
              value={opType}
              onChange={(e) => setOpType(e.target.value as typeof opType)}
            >
              <option value="DEPOSIT">Пополнение</option>
              <option value="WITHDRAWAL">Вывод</option>
              <option value="TRANSFER">Перевод</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">Дата и время</span>
            <input
              type="datetime-local"
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
              value={timestampLocal}
              onChange={(e) => setTimestampLocal(e.target.value)}
            />
          </label>

          {opType === "TRANSFER" ? (
            <>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-secondary)]">Со счёта</span>
                <select
                  className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                  value={fromAccountId}
                  onChange={(e) => setFromAccountId(e.target.value)}
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="text-[var(--text-secondary)]">На счёт</span>
                <select
                  className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                  value={toAccountId}
                  onChange={(e) => setToAccountId(e.target.value)}
                >
                  <option value="">—</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
            </>
          ) : (
            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span className="text-[var(--text-secondary)]">Счёт</span>
              <select
                className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                <option value="">—</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">Сумма</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 tabular-nums"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">Валюта</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            />
          </label>
          {currency.trim().toUpperCase() !== "USDT" ? (
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-[var(--text-secondary)]">Курс → USDT (за 1 ед.)</span>
              <input
                className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 tabular-nums"
                value={fxRate}
                onChange={(e) => setFxRate(e.target.value)}
                inputMode="decimal"
                placeholder="напр. 1.0"
              />
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-[var(--text-secondary)]">Комиссия (опц.)</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1 tabular-nums"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm md:col-span-2">
            <span className="text-[var(--text-secondary)]">Заметка</span>
            <input
              className="rounded border border-[var(--border)] bg-[var(--background)] px-2 py-1"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </label>

          {formError ? (
            <p className="text-sm text-[var(--accent-red)] md:col-span-2">{formError}</p>
          ) : null}
          <div className="md:col-span-2 flex flex-wrap gap-2">
            <button
              type="submit"
              className="rounded-lg bg-[var(--accent-green)] px-4 py-2 text-sm font-medium text-[var(--background)]"
            >
              {editingId ? "Сохранить" : "Добавить"}
            </button>
            {editingId ? (
              <button
                type="button"
                className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm text-[var(--text-secondary)]"
                onClick={() => {
                  resetFormFields()
                  setFormError(null)
                }}
              >
                Отмена
              </button>
            ) : null}
          </div>
        </form>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--surface)]">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--text-secondary)]">
              <th className="p-2 font-medium">Время (UTC в данных)</th>
              <th className="p-2 font-medium">Тип</th>
              <th className="p-2 font-medium">Счета</th>
              <th className="p-2 font-medium">Сумма</th>
              <th className="p-2 font-medium">Тело (USDT)</th>
              <th className="p-2 font-medium">Fee (USDT)</th>
              <th className="p-2 font-medium" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="p-4 text-[var(--text-secondary)]">
                  Загрузка…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-4 text-[var(--text-secondary)]">
                  Нет операций за период
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-[var(--border)]/60 hover:bg-white/5">
                  <td className="p-2 font-mono text-xs">{new Date(r.timestamp).toISOString().slice(0, 19)}Z</td>
                  <td className="p-2">{typeLabel(r.type)}</td>
                  <td className="p-2 text-[var(--text-secondary)]">
                    {r.type === "TRANSFER" ? (
                      <>
                        {accountLabel(accounts, r.fromAccountId)} →{" "}
                        {accountLabel(accounts, r.toAccountId)}
                      </>
                    ) : (
                      accountLabel(accounts, r.accountId)
                    )}
                  </td>
                  <td className="p-2 tabular-nums">
                    {r.amount} {r.currency}
                    {r.fee != null && r.fee > 0 ? ` (fee ${r.fee})` : ""}
                  </td>
                  <td className="p-2 tabular-nums">{formatInQuote(r.amountBodyUsdt, "USDT")}</td>
                  <td className="p-2 tabular-nums">{formatInQuote(r.feeUsdt, "USDT")}</td>
                  <td className="p-2 text-right whitespace-nowrap">
                    <button
                      type="button"
                      className="mr-3 text-[var(--accent-blue)] hover:underline"
                      onClick={() => startEdit(r)}
                    >
                      Изменить
                    </button>
                    <button
                      type="button"
                      className="text-[var(--accent-red)] hover:underline"
                      onClick={() => void onDelete(r.id)}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-4 text-xs text-[var(--text-secondary)]">
        В таблице для пополнения USDT показано нетто (сумма − комиссия в USDT). Для вывода/перевода
        смотрите сумму и комиссию в исходной валюте; эффект на equity считается на сервере.
      </p>
    </div>
  )
}
