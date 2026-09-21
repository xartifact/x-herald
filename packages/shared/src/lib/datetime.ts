/**
 * Timezone-aware date/time formatting shared by the web app and the gateway.
 *
 * Everything here is built on native `Intl` — no `dayjs` / `date-fns` /
 * `luxon`. The point of the module is that both halves of the product format
 * timestamps the same way, in the *user's* timezone rather than a hardcoded one:
 * the codebase previously pinned `toLocaleString('zh-CN')` in dozens of places,
 * which shows the wrong wall clock to everyone outside UTC+8.
 *
 * A caller supplies the locale and IANA timezone it wants (the web app reads
 * them from the locale switcher, the gateway from a `?tz=` parameter). Omitting
 * them means "use the runtime's defaults", which is the browser's own locale and
 * timezone — correct for client rendering, and deliberately explicit for the
 * server, whose process timezone must never decide what a user sees.
 *
 * @module @xartifact/x-herald-shared/lib/datetime
 */

/** Formatting inputs shared by every function here. */
export interface FormatOptions {
  /** BCP 47 locale tag; defaults to the runtime locale. */
  readonly locale?: string
  /** IANA timezone name (e.g. `Asia/Shanghai`); defaults to the runtime timezone. */
  readonly timezone?: string
}

/** Accepted timestamp input: a Date, epoch milliseconds, or an ISO string. */
export type DateInput = Date | number | string

/**
 * Convert a timestamp input into a Date.
 * @param value - Date, epoch milliseconds, or ISO string.
 * @returns the Date, or undefined when the input is absent or unparseable.
 */
function toDate(value: DateInput | null | undefined): Date | undefined {
  if (value === null || value === undefined) return undefined
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date
}

/**
 * Build the `Intl` options shared by the date/time formatters.
 * @param options - locale and timezone overrides.
 * @returns a `DateTimeFormatOptions` carrying only the supplied fields.
 */
function zoneOptions(options: FormatOptions): Intl.DateTimeFormatOptions {
  return options.timezone === undefined ? {} : { timeZone: options.timezone }
}

/**
 * Format a full date and time for display.
 * @param value - Date, epoch milliseconds, or ISO string.
 * @param options - locale and timezone overrides.
 * @param fallback - returned when the input is absent or unparseable.
 * @returns the localized date-time, or the fallback.
 */
export function formatDateTime(
  value: DateInput | null | undefined,
  options: FormatOptions = {},
  fallback = '-',
): string {
  const date = toDate(value)
  if (date === undefined) return fallback
  return new Intl.DateTimeFormat(options.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...zoneOptions(options),
  }).format(date)
}

/**
 * Format a calendar date (no time of day).
 * @param value - Date, epoch milliseconds, or ISO string.
 * @param options - locale and timezone overrides.
 * @param fallback - returned when the input is absent or unparseable.
 * @returns the localized date, or the fallback.
 */
export function formatDate(
  value: DateInput | null | undefined,
  options: FormatOptions = {},
  fallback = '-',
): string {
  const date = toDate(value)
  if (date === undefined) return fallback
  return new Intl.DateTimeFormat(options.locale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...zoneOptions(options),
  }).format(date)
}

/**
 * Format a clock time (no calendar date).
 * @param value - Date, epoch milliseconds, or ISO string.
 * @param options - locale and timezone overrides.
 * @param fallback - returned when the input is absent or unparseable.
 * @returns the localized time, or the fallback.
 */
export function formatTime(
  value: DateInput | null | undefined,
  options: FormatOptions = {},
  fallback = '-',
): string {
  const date = toDate(value)
  if (date === undefined) return fallback
  return new Intl.DateTimeFormat(options.locale, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    ...zoneOptions(options),
  }).format(date)
}

/** Relative-time units, widest first so the largest sensible unit wins. */
const RELATIVE_UNITS: ReadonlyArray<readonly [Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 365 * 24 * 60 * 60 * 1000],
  ['month', 30 * 24 * 60 * 60 * 1000],
  ['day', 24 * 60 * 60 * 1000],
  ['hour', 60 * 60 * 1000],
  ['minute', 60 * 1000],
  ['second', 1000],
]

/**
 * Format a timestamp relative to now ("3 minutes ago", "in 2 days").
 *
 * The unit is the largest one that divides evenly enough to read naturally: a
 * 90-minute gap reads as "2 hours ago", not "90 minutes ago".
 * @param value - Date, epoch milliseconds, or ISO string.
 * @param options - locale override (relative time carries no timezone).
 * @param now - reference instant; defaults to the current time.
 * @param fallback - returned when the input is absent or unparseable.
 * @returns the localized relative time, or the fallback.
 */
export function formatRelative(
  value: DateInput | null | undefined,
  options: FormatOptions = {},
  now: DateInput = Date.now(),
  fallback = '-',
): string {
  const date = toDate(value)
  const reference = toDate(now)
  if (date === undefined || reference === undefined) return fallback
  const deltaMs = date.getTime() - reference.getTime()
  const formatter = new Intl.RelativeTimeFormat(options.locale, { numeric: 'auto' })
  for (const [unit, unitMs] of RELATIVE_UNITS) {
    if (Math.abs(deltaMs) >= unitMs) {
      return formatter.format(Math.round(deltaMs / unitMs), unit)
    }
  }
  return formatter.format(0, 'second')
}

/**
 * The runtime's IANA timezone, for use as a formatting default.
 *
 * Returns `UTC` rather than throwing when the runtime cannot report one — a
 * gateway process must format *something* deterministic instead of failing a
 * response because it could not detect its own zone.
 * @returns an IANA timezone name.
 */
export function getUserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/**
 * Normalize a timestamp to a canonical UTC ISO string.
 *
 * This is the form that crosses a boundary (API payloads, log records, DB
 * writes): it is unambiguous, sorts lexicographically, and round-trips through
 * `new Date()` unchanged.
 * @param value - Date, epoch milliseconds, or ISO string.
 * @param fallback - returned when the input is absent or unparseable.
 * @returns the UTC ISO string, or the fallback.
 */
export function toUTCISO(value: DateInput | null | undefined, fallback = ''): string {
  const date = toDate(value)
  return date === undefined ? fallback : date.toISOString()
}

/**
 * Render a date as the `YYYY-MM-DD` day it falls on in a given timezone.
 *
 * Deliberately not `toISOString().slice(0, 10)`: that reads the UTC day, so a
 * request at 07:00 in Asia/Shanghai (23:00 UTC the previous day) lands in the
 * wrong bucket. Aggregations and date filters must use this instead.
 * @param value - Date, epoch milliseconds, or ISO string.
 * @param options - locale and timezone overrides (locale is unused; kept for symmetry).
 * @param fallback - returned when the input is absent or unparseable.
 * @returns the local calendar day, or the fallback.
 */
export function toLocalDateKey(
  value: DateInput | null | undefined,
  options: FormatOptions = {},
  fallback = '',
): string {
  const date = toDate(value)
  if (date === undefined) return fallback
  // `en-CA` renders as YYYY-MM-DD, which is the key format aggregations group by.
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...zoneOptions(options),
  }).format(date)
}

/**
 * Validate an IANA timezone name.
 *
 * Used to reject a client-supplied `?tz=` value before it reaches SQL: an
 * unknown zone must degrade to the default, never reach the database.
 * @param timezone - candidate IANA timezone name.
 * @returns true when the runtime recognizes the zone.
 */
export function isValidTimezone(timezone: string): boolean {
  try {
    // Constructing the formatter is the validation: `Intl` throws a RangeError
    // for an unknown zone. The result is unused beyond that.
    return (
      new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone !== ''
    )
  } catch {
    return false
  }
}
