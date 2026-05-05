"use client"

import type { AccountDto, EmotionDto, StrategyDto } from "@/contracts/settings-catalog"

type Listener = () => void
const listeners = new Set<Listener>()

/** Инвалидация всех in-flight GET (размонтирование страницы, «Добавить», правки). */
let fetchGeneration = 0

function notify() {
  for (const l of listeners) l()
}

let accounts: AccountDto[] = []
let strategies: StrategyDto[] = []
let emotions: EmotionDto[] = []

/**
 * Списки справочников вне React state, чтобы пережить размонтирование
 * (refetch сессии, «Загрузка…» на странице и т.д.).
 */
export const settingsListsStore = {
  subscribe(fn: Listener) {
    listeners.add(fn)
    return () => listeners.delete(fn)
  },

  beginFetch(): number {
    return ++fetchGeneration
  },
  isActiveFetch(gen: number): boolean {
    return gen === fetchGeneration
  },
  bumpFetchGen(): void {
    fetchGeneration += 1
  },

  getAccounts: () => accounts,
  getStrategies: () => strategies,
  getEmotions: () => emotions,

  getServerAccounts: (): AccountDto[] => [],
  getServerStrategies: (): StrategyDto[] => [],
  getServerEmotions: (): EmotionDto[] => [],

  setAccounts(next: AccountDto[]) {
    accounts = next
    notify()
  },
  setStrategies(next: StrategyDto[]) {
    strategies = next
    notify()
  },
  setEmotions(next: EmotionDto[]) {
    emotions = next
    notify()
  },

  updateAccounts(updater: (prev: AccountDto[]) => AccountDto[]) {
    accounts = updater(accounts)
    notify()
  },
  updateStrategies(updater: (prev: StrategyDto[]) => StrategyDto[]) {
    strategies = updater(strategies)
    notify()
  },
  updateEmotions(updater: (prev: EmotionDto[]) => EmotionDto[]) {
    emotions = updater(emotions)
    notify()
  },

  reset() {
    accounts = []
    strategies = []
    emotions = []
    notify()
  },
}
