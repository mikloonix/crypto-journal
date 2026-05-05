/** Человекочитаемая длительность для журнала (мс → дни/часы/минуты). */
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—"
  const totalM = Math.floor(ms / 60000)
  if (totalM < 1) return "<1м"
  const d = Math.floor(totalM / 1440)
  const h = Math.floor((totalM % 1440) / 60)
  const m = totalM % 60
  if (d > 0) return `${d}д ${h}ч`
  if (h > 0) return `${h}ч ${m}м`
  return `${m}м`
}
