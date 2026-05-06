import { addDays, subDays } from "date-fns"
import { formatInTimeZone, fromZonedTime } from "date-fns-tz"

/** Полуинтервал [00:00, +1d) для календарной даты `YYYY-MM-DD` в зоне `timeZone` (IANA). */
export function zonedDayHalfOpenUtc(timeZone: string, ymd: string): { start: Date; endExclusive: Date } {
  const start = fromZonedTime(`${ymd}T00:00:00`, timeZone)
  const endExclusive = addDays(start, 1)
  return { start, endExclusive }
}

/** Период from..to включительно по календарю в зоне → `[T_start, T_endExclusive)` в UTC. */
export function zonedPeriodHalfOpenUtc(
  timeZone: string,
  fromYmd: string,
  toYmd: string,
): { start: Date; endExclusive: Date } {
  const start = fromZonedTime(`${fromYmd}T00:00:00`, timeZone)
  const endExclusive = addDays(fromZonedTime(`${toYmd}T00:00:00`, timeZone), 1)
  return { start, endExclusive }
}

/** Сегодня / вчера как `YYYY-MM-DD` в зоне (вчера через полдень как опору — меньше сбоев DST). */
export function zonedTodayYesterdayYmd(timeZone: string, now: Date = new Date()): {
  todayYmd: string
  yesterdayYmd: string
} {
  const todayYmd = formatInTimeZone(now, timeZone, "yyyy-MM-dd")
  const ref = fromZonedTime(`${todayYmd}T12:00:00`, timeZone)
  const yesterdayYmd = formatInTimeZone(addDays(ref, -1), timeZone, "yyyy-MM-dd")
  return { todayYmd, yesterdayYmd }
}

export function zonedDayBoundsIsoForPreset(
  timeZone: string,
  preset: "today" | "yesterday",
  now: Date = new Date(),
): { dayStart: string; dayEndExclusive: string } {
  const { todayYmd, yesterdayYmd } = zonedTodayYesterdayYmd(timeZone, now)
  const ymd = preset === "today" ? todayYmd : yesterdayYmd
  const { start, endExclusive } = zonedDayHalfOpenUtc(timeZone, ymd)
  return { dayStart: start.toISOString(), dayEndExclusive: endExclusive.toISOString() }
}

/**
 * Скользящие `dayCount` календарных дней включительно (от «сегодня» в зоне назад).
 * Опорная точка полдень — стабильнее при DST.
 */
export function zonedRollingPeriodInclusiveYmd(
  timeZone: string,
  dayCount: number,
  now: Date = new Date(),
): { fromYmd: string; toYmd: string } {
  const toYmd = formatInTimeZone(now, timeZone, "yyyy-MM-dd")
  const ref = fromZonedTime(`${toYmd}T12:00:00`, timeZone)
  const fromUtc = subDays(ref, Math.max(1, dayCount) - 1)
  const fromYmd = formatInTimeZone(fromUtc, timeZone, "yyyy-MM-dd")
  return { fromYmd, toYmd }
}
