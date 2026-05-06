/** Проверка IANA через Intl (Node / браузер). */
export function isValidIanaTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== "string" || tz.trim() === "") return false
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() })
    return true
  } catch {
    return false
  }
}

/** Популярные зоны для селектора настроек (IANA). */
/**
 * Смещение от UTC в часах → IANA `Etc/GMT*`.
 * UTC+3 → `Etc/GMT-3` (в базе tz знак у Etc/GMT инвертирован).
 */
export function ianaFromUtcOffsetHours(offsetHours: number): string {
  if (!Number.isFinite(offsetHours)) return "UTC"
  const h = Math.round(offsetHours)
  if (h === 0) return "UTC"
  if (h > 0) return `Etc/GMT-${h}`
  return `Etc/GMT+${-h}`
}

/** Распознаёт `UTC`, `Etc/GMT±N` → смещение от UTC в часах; иначе `null`. */
export function tryParseUtcOffsetFromIana(tz: string): number | null {
  const t = tz.trim()
  if (t === "UTC") return 0
  const m = /^Etc\/GMT([+-])(\d{1,2})$/i.exec(t)
  if (!m) return null
  const n = Number(m[2])
  if (!Number.isFinite(n)) return null
  return m[1].toUpperCase() === "-" ? n : -n
}

/**
 * Пресеты «по смещению UTC»: в БД сохраняется **IANA города/региона** (Intl стабильнее, чем только Etc/GMT*).
 * Подпись — ориентировочное зимнее/стандартное смещение; у зон с DST летом часы сдвигаются.
 */
export const UTC_OFFSET_STYLE_PRESETS = [
  { offsetHours: -12, iana: "Etc/GMT+12", labelRu: "UTC−12 · линия даты (фикс. Etc/GMT+12)" },
  { offsetHours: -11, iana: "Pacific/Midway", labelRu: "UTC−11 · Мидуэй" },
  { offsetHours: -10, iana: "Pacific/Honolulu", labelRu: "UTC−10 · Гонолулу" },
  { offsetHours: -9, iana: "America/Anchorage", labelRu: "UTC−9 · Анкоридж" },
  { offsetHours: -8, iana: "America/Los_Angeles", labelRu: "UTC−8 · Лос-Анджелес" },
  { offsetHours: -7, iana: "America/Denver", labelRu: "UTC−7 · Денвер" },
  { offsetHours: -6, iana: "America/Chicago", labelRu: "UTC−6 · Чикаго" },
  { offsetHours: -5, iana: "America/New_York", labelRu: "UTC−5 · Нью-Йорк, Торонто" },
  { offsetHours: -4, iana: "America/Caracas", labelRu: "UTC−4 · Каракас" },
  { offsetHours: -3, iana: "America/Sao_Paulo", labelRu: "UTC−3 · Сан-Паулу" },
  { offsetHours: -2, iana: "Atlantic/South_Georgia", labelRu: "UTC−2 · Южная Георгия" },
  { offsetHours: -1, iana: "Atlantic/Cape_Verde", labelRu: "UTC−1 · Кабо-Верде" },
  { offsetHours: 0, iana: "UTC", labelRu: "UTC±0" },
  { offsetHours: 1, iana: "Africa/Lagos", labelRu: "UTC+1 · Лагос" },
  { offsetHours: 2, iana: "Africa/Cairo", labelRu: "UTC+2 · Каир" },
  { offsetHours: 3, iana: "Europe/Moscow", labelRu: "UTC+3 · Москва" },
  { offsetHours: 4, iana: "Asia/Dubai", labelRu: "UTC+4 · Дубай" },
  { offsetHours: 5, iana: "Asia/Karachi", labelRu: "UTC+5 · Карачи" },
  { offsetHours: 6, iana: "Asia/Dhaka", labelRu: "UTC+6 · Дакка" },
  { offsetHours: 7, iana: "Asia/Bangkok", labelRu: "UTC+7 · Бангкок" },
  { offsetHours: 8, iana: "Asia/Singapore", labelRu: "UTC+8 · Сингапур" },
  { offsetHours: 9, iana: "Asia/Tokyo", labelRu: "UTC+9 · Токио" },
  { offsetHours: 10, iana: "Australia/Brisbane", labelRu: "UTC+10 · Брисбен" },
  { offsetHours: 11, iana: "Pacific/Noumea", labelRu: "UTC+11 · Нумеа" },
  { offsetHours: 12, iana: "Pacific/Fiji", labelRu: "UTC+12 · Фиджи" },
  { offsetHours: 13, iana: "Pacific/Tongatapu", labelRu: "UTC+13 · Тонгатапу" },
  { offsetHours: 14, iana: "Pacific/Kiritimati", labelRu: "UTC+14 · Киримати" },
] as const

/** Подобрать значение для режима «по смещению»: точное совпадение IANA или переход с устаревшего Etc/GMT*. */
export function resolveOffsetStylePresetIana(storedTz: string): string | null {
  const t = storedTz.trim()
  const direct = UTC_OFFSET_STYLE_PRESETS.find((p) => p.iana === t)
  if (direct) return direct.iana
  const off = tryParseUtcOffsetFromIana(t)
  if (off == null) return null
  return UTC_OFFSET_STYLE_PRESETS.find((p) => p.offsetHours === off)?.iana ?? null
}

export const COMMON_IANA_TIME_ZONES = [
  "UTC",
  "Europe/Moscow",
  "Europe/Kaliningrad",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Seoul",
  "Australia/Sydney",
] as const
