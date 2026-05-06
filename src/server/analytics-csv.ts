import type { AnalyticsSnapshotDto } from "@/contracts/analytics"

function esc(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function row(cells: (string | number | boolean | null | undefined)[]): string {
  return cells.map((c) => esc(c == null ? "" : String(c))).join(",")
}

/** UTF-8 с BOM для Excel; разделитель запятая. */
export function formatAnalyticsSnapshotCsv(s: AnalyticsSnapshotDto): string {
  const lines: string[] = []
  lines.push(row(["section", "key", "value"]))

  const { summary } = s
  const summaryPairs: [string, string | number | boolean | null | undefined][] = [
    ["timeZone", s.timeZone],
    ["fromYmd", s.fromYmd],
    ["toYmd", s.toYmd],
    ["journalAllAccounts", s.journalAllAccounts],
    ["accountId", s.accountId],
    ["symbolFilter", s.symbolFilter],
    ["strategyFilter", s.strategyFilter],
    ["marketTypeFilter", s.marketTypeFilter],
    ["totalPnlUsdt", summary.totalPnlUsdt],
    ["pnlPercentPeriod", summary.pnlPercentPeriod],
    ["capitalAtPeriodStartUsdt", summary.capitalAtPeriodStartUsdt],
    ["closedCount", summary.closedCount],
    ["winCount", summary.winCount],
    ["lossCount", summary.lossCount],
    ["breakevenCount", summary.breakevenCount],
    ["winratePercent", summary.winratePercent],
    ["avgWinUsdt", summary.avgWinUsdt],
    ["avgLossUsdt", summary.avgLossUsdt],
    ["profitFactor", summary.profitFactor],
    ["riskReward", summary.riskReward],
    ["grossProfitUsdt", summary.grossProfitUsdt],
    ["grossLossUsdt", summary.grossLossUsdt],
    ["bestTradePnlUsdt", summary.bestTradePnlUsdt],
    ["worstTradePnlUsdt", summary.worstTradePnlUsdt],
    ["maxTradeRoiPercent", summary.maxTradeRoiPercent],
    ["sharpeRatio", summary.sharpeRatio],
    ["maxDrawdownUsdt", summary.maxDrawdownUsdt],
    ["maxDrawdownPercent", summary.maxDrawdownPercent],
    ["expectancyUsdt", summary.expectancyUsdt],
    ["recoveryFactor", summary.recoveryFactor],
    ["avgHoldingMs", summary.avgHoldingMs],
  ]
  for (const [k, v] of summaryPairs) {
    lines.push(row(["summary", k, v]))
  }

  lines.push(row(["equity", "index", "closedAt", "pnlUsdt", "cumulativePnlUsdt", "balanceUsdt"]))
  for (const p of s.equityCurve) {
    lines.push(row(["equity", p.index, p.closedAt, p.pnlUsdt, p.cumulativePnlUsdt, p.balanceUsdt]))
  }

  lines.push(row(["pnlByDay", "dayYmd", "pnlUsdt"]))
  for (const d of s.pnlByDay) {
    lines.push(row(["pnlByDay", d.dayYmd, d.pnlUsdt]))
  }

  lines.push(row(["strategy", "name", "pnlUsdt", "count", "winratePercent"]))
  for (const x of s.strategySlices) {
    lines.push(row(["strategy", x.strategy, x.pnlUsdt, x.count, x.winratePercent]))
  }

  lines.push(row(["symbol", "name", "pnlUsdt", "count"]))
  for (const x of s.symbolSlices) {
    lines.push(row(["symbol", x.symbol, x.pnlUsdt, x.count]))
  }

  lines.push(row(["weekday", "weekday", "label", "pnlUsdt", "count"]))
  for (const x of s.weekdaySlices) {
    lines.push(row(["weekday", x.weekday, x.label, x.pnlUsdt, x.count]))
  }

  lines.push(row(["hour", "hour", "pnlUsdt", "count"]))
  for (const x of s.hourSlices) {
    lines.push(row(["hour", x.hour, x.pnlUsdt, x.count]))
  }

  lines.push(row(["marketDirection", "marketType", "direction", "pnlUsdt", "count"]))
  for (const x of s.marketDirectionSlices) {
    lines.push(row(["marketDirection", x.marketType, x.direction, x.pnlUsdt, x.count]))
  }

  lines.push(row(["emotionEntry", "label", "pnlUsdt", "count"]))
  for (const x of s.emotionEntrySlices) {
    lines.push(row(["emotionEntry", x.label, x.pnlUsdt, x.count]))
  }

  lines.push(row(["emotionExit", "label", "pnlUsdt", "count"]))
  for (const x of s.emotionExitSlices) {
    lines.push(row(["emotionExit", x.label, x.pnlUsdt, x.count]))
  }

  lines.push(row(["histogram", "binStart", "binEnd", "count"]))
  for (const b of s.histogram) {
    lines.push(row(["histogram", b.binStart, b.binEnd, b.count]))
  }

  lines.push(row(["winLoss", "key", "value"]))
  lines.push(row(["winLoss", "winTrades", s.winLoss.winTrades]))
  lines.push(row(["winLoss", "lossTrades", s.winLoss.lossTrades]))
  lines.push(row(["winLoss", "pnlFromWinsUsdt", s.winLoss.pnlFromWinsUsdt]))
  lines.push(row(["winLoss", "pnlFromLossesUsdt", s.winLoss.pnlFromLossesUsdt]))

  return "\uFEFF" + lines.join("\r\n")
}
