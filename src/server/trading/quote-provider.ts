/** Источник mark price (BingX — этап 5). */

export type QuoteProvider = {
  getMarkPrice(symbol: string): number | null
}

export function createQuoteProvider(markPrices: Record<string, number>): QuoteProvider {
  const norm: Record<string, number> = {}
  for (const [k, v] of Object.entries(markPrices)) {
    if (Number.isFinite(v) && v > 0) norm[k.trim().toUpperCase()] = v
  }
  return {
    getMarkPrice(symbol: string) {
      const key = symbol.trim().toUpperCase()
      const p = norm[key]
      return p != null && p > 0 ? p : null
    },
  }
}

/** Заглушка BingX до этапа 5. */
export const bingxQuoteProviderStub: QuoteProvider = {
  getMarkPrice() {
    return null
  },
}
