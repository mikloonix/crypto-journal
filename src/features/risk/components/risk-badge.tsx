import type { TradeRiskDto } from "@/contracts/risk"

export function RiskBadge({ risk }: { risk: TradeRiskDto }) {
  if (risk.status === "NA") {
    return <span className="text-xs text-[var(--text-secondary)]">—</span>
  }
  const high = risk.status === "HIGH"
  const label = high ? "Risk High" : "Risk OK"
  const title = risk.reasons.length ? risk.reasons.join("\n") : undefined
  return (
    <span
      title={title}
      className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${
        high
          ? "bg-[var(--accent-red)]/20 text-[var(--accent-red)]"
          : "bg-[var(--accent-green)]/15 text-[var(--accent-green)]"
      }`}
    >
      {label}
    </span>
  )
}
