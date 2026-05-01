export function calculatePnL(trade: any) {
  if (!trade.exitPrice) return 0

  if (trade.direction === "LONG") {
    return (trade.exitPrice - trade.entryPrice) * trade.volume
  } else {
    return (trade.entryPrice - trade.exitPrice) * trade.volume
  }
}