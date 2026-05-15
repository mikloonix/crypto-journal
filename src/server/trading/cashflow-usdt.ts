import { CashflowType, type Cashflow } from "@prisma/client"

export type JournalEquityScope = {
  journalAllAccounts: boolean
  /** Активный счёт журнала; при `journalAllAccounts` игнорируется. */
  journalAccountId: string | undefined
}

function isUsdtCurrency(currency: string): boolean {
  return currency.trim().toUpperCase() === "USDT"
}

/** USDT за 1 единицу `currency`. */
export function effectiveFxRateToUsdt(currency: string, fxRate: number | null | undefined): number {
  if (isUsdtCurrency(currency)) return 1
  if (fxRate == null || !Number.isFinite(fxRate) || fxRate <= 0) {
    return NaN
  }
  return fxRate
}

/** Сумма основной суммы в USDT (без учёта fee — fee обрабатывается в delta). */
export function cashflowAmountBodyUsdt(cf: Cashflow): number {
  const fx = effectiveFxRateToUsdt(cf.currency, cf.fxRate)
  if (!Number.isFinite(fx)) return NaN
  return cf.amount * fx
}

export function cashflowFeeUsdt(cf: Cashflow): number {
  const fee = cf.fee ?? 0
  if (fee === 0) return 0
  const fx = effectiveFxRateToUsdt(cf.currency, cf.fxRate)
  if (!Number.isFinite(fx)) return NaN
  return fee * fx
}

/**
 * Изменение «equity» выбранной области (один счёт или все) от одной операции.
 * TRANSFER при «все счета» даёт 0.
 */
export function cashflowPortfolioDeltaUsdt(cf: Cashflow, scope: JournalEquityScope): number {
  const body = cashflowAmountBodyUsdt(cf)
  const feeU = cashflowFeeUsdt(cf)
  if (!Number.isFinite(body) || !Number.isFinite(feeU)) return NaN

  const { journalAllAccounts, journalAccountId } = scope

  if (cf.type === CashflowType.DEPOSIT) {
    const net = body - feeU
    if (journalAllAccounts) return net
    if (cf.accountId === journalAccountId) return net
    return 0
  }

  if (cf.type === CashflowType.WITHDRAWAL) {
    const out = body + feeU
    if (journalAllAccounts) return -out
    if (cf.accountId === journalAccountId) return -out
    return 0
  }

  if (cf.type === CashflowType.TRANSFER) {
    if (journalAllAccounts) return 0
    if (!journalAccountId) return 0
    if (cf.fromAccountId === journalAccountId) return -(body + feeU)
    if (cf.toAccountId === journalAccountId) return body
    return 0
  }

  return 0
}

/** Нетто-эффект одной операции в USDT (для таблицы; TRANSFER без контекста счёта = 0). */
export function cashflowNetEffectUsdtRow(cf: Cashflow): number {
  const body = cashflowAmountBodyUsdt(cf)
  const feeU = cashflowFeeUsdt(cf)
  if (!Number.isFinite(body)) return NaN
  const fee = Number.isFinite(feeU) ? feeU : 0
  if (cf.type === CashflowType.DEPOSIT) return body - fee
  if (cf.type === CashflowType.WITHDRAWAL) return -(body + fee)
  return 0
}

export function netCashflowPortfolioUsdt(cashflows: Cashflow[], scope: JournalEquityScope): number {
  let s = 0
  for (const cf of cashflows) {
    const d = cashflowPortfolioDeltaUsdt(cf, scope)
    if (!Number.isFinite(d)) return NaN
    s += d
  }
  return s
}
