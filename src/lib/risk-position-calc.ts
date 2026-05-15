/** Калькулятор позиции (клиент + сервер). Маржа USDT из лимита риска. */

export function suggestMarginFromRisk(params: {
  accountBalance: number
  riskPerTradePercent: number
  entryPrice: number
  stopPrice: number
  leverage: number
}): { marginUsdt: number; notionalUsdt: number; riskUsdt: number } | null {
  const { accountBalance, riskPerTradePercent, entryPrice, stopPrice, leverage } = params
  if (!(accountBalance > 0) || !(entryPrice > 0) || !(stopPrice > 0) || !(leverage > 0)) {
    return null
  }
  const riskUsdt = (accountBalance * Math.max(0, riskPerTradePercent)) / 100
  const stopDistPct = (Math.abs(entryPrice - stopPrice) / entryPrice) * 100
  if (stopDistPct < 1e-8) return null
  const contractVol = riskUsdt / ((stopDistPct / 100) * entryPrice)
  const notionalUsdt = contractVol * entryPrice
  const marginUsdt = notionalUsdt / leverage
  if (!(marginUsdt > 0)) return null
  return { marginUsdt, notionalUsdt, riskUsdt }
}
