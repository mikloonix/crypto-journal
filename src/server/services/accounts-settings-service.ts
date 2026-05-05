import { AccountSource } from "@prisma/client"
import type { AccountDto, AccountsListDto } from "@/contracts/settings-catalog"
import { accountRepository } from "@/server/repositories/account-repository"

function toDto(a: {
  id: string
  name: string
  isDefault: boolean
  source: AccountSource
}): AccountDto {
  return {
    id: a.id,
    name: a.name,
    isDefault: a.isDefault,
    source: a.source === AccountSource.BINGX ? "BINGX" : "MANUAL",
  }
}

function parseAccountSource(
  raw: unknown,
): { ok: true; source: AccountSource } | { ok: false; error: string } {
  if (raw == null || raw === "") return { ok: true, source: AccountSource.MANUAL }
  const s = String(raw).toUpperCase()
  if (s === "MANUAL") return { ok: true, source: AccountSource.MANUAL }
  if (s === "BINGX") return { ok: true, source: AccountSource.BINGX }
  return { ok: false, error: "Тип счёта: MANUAL или BINGX" }
}

export const accountsSettingsService = {
  async listAccounts(userId: string): Promise<AccountsListDto> {
    const rows = await accountRepository.ensureDefaultAndBackfill(userId)
    return { accounts: rows.map(toDto) }
  },

  async createAccount(
    userId: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: true; account: AccountDto } | { ok: false; error: string; status: number }> {
    const name = String(body.name ?? "").trim()
    if (!name) {
      return { ok: false, error: "Нужно имя счёта", status: 400 }
    }
    const src = parseAccountSource(body.source)
    if (!src.ok) return { ok: false, error: src.error, status: 400 }
    await accountRepository.ensureDefaultAndBackfill(userId)
    const row = await accountRepository.create(userId, name, src.source)
    return { ok: true, account: toDto(row) }
  },

  async patchAccount(
    userId: string,
    accountId: string,
    body: Record<string, unknown>,
  ): Promise<{ ok: true; account: AccountDto } | { ok: false; error: string; status: number }> {
    const acc = await accountRepository.findFirst(userId, accountId)
    if (!acc) {
      return { ok: false, error: "Not found", status: 404 }
    }
    if (body.name == null && body.isDefault !== true && body.source == null) {
      return { ok: false, error: "Нет полей для обновления", status: 400 }
    }
    const patch: { name?: string; source?: AccountSource } = {}
    if (body.name != null) {
      const name = String(body.name).trim()
      if (!name) {
        return { ok: false, error: "Пустое имя", status: 400 }
      }
      patch.name = name
    }
    if (body.source != null) {
      const src = parseAccountSource(body.source)
      if (!src.ok) return { ok: false, error: src.error, status: 400 }
      patch.source = src.source
    }
    if (Object.keys(patch).length > 0) {
      await accountRepository.updateFields(userId, accountId, patch)
    }
    if (body.isDefault === true) {
      await accountRepository.setDefault(userId, accountId)
    }
    const fresh = await accountRepository.findFirst(userId, accountId)
    if (!fresh) {
      return { ok: false, error: "Not found", status: 404 }
    }
    return { ok: true, account: toDto(fresh) }
  },

  async deleteAccount(
    userId: string,
    accountId: string,
  ): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
    const acc = await accountRepository.findFirst(userId, accountId)
    if (!acc) {
      return { ok: false, error: "Not found", status: 404 }
    }
    if (acc.isDefault) {
      return { ok: false, error: "Нельзя удалить счёт по умолчанию", status: 400 }
    }
    const r = await accountRepository.deleteIfEmpty(userId, accountId)
    if (!r.ok) {
      if (r.reason === "HAS_TRADES") {
        return { ok: false, error: "На счёте есть сделки", status: 400 }
      }
      return { ok: false, error: "Not found", status: 404 }
    }
    return { ok: true }
  },
}
