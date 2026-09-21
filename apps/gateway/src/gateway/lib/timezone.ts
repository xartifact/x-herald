/**
 * `?tz=` handling for aggregation endpoints.
 *
 * Aggregations that bucket by calendar day must bucket by the *caller's* day,
 * not the gateway process's. The process timezone is an accident of deployment
 * (production happens to run UTC); a user in Asia/Shanghai asking for "today"
 * means their today, which starts eight hours before the server's.
 *
 * Callers pass an IANA zone name. Anything absent or unrecognized degrades to
 * UTC rather than failing the request: an unknown zone must never reach SQL, and
 * a bad query parameter should not break a dashboard.
 *
 * @module apps/gateway/src/gateway/lib/timezone
 */

import { isValidTimezone } from '@xartifact/x-herald-shared'

/** Fallback zone when the caller names none, or names one we cannot trust. */
export const DEFAULT_AGGREGATION_TIMEZONE = 'UTC'

/**
 * Resolve the aggregation timezone from a raw `?tz=` value.
 * @param value - raw query value, or undefined when the caller omitted it.
 * @returns a validated IANA zone name; {@link DEFAULT_AGGREGATION_TIMEZONE} otherwise.
 */
export function resolveTimezone(value: string | undefined): string {
  if (!value) return DEFAULT_AGGREGATION_TIMEZONE
  const trimmed = value.trim()
  if (!trimmed) return DEFAULT_AGGREGATION_TIMEZONE
  // Rejecting here is what keeps an unvalidated string out of the SQL that
  // interpolates it into `AT TIME ZONE`.
  return isValidTimezone(trimmed) ? trimmed : DEFAULT_AGGREGATION_TIMEZONE
}

/**
 * The instant a calendar day begins in a given timezone, expressed as a UTC Date.
 *
 * This is the boundary an aggregation compares against. Computing it from the
 * server's own clock (`new Date(y, m, d)`) silently uses the process timezone —
 * the defect this module exists to remove.
 * @param timezone - validated IANA zone name.
 * @param now - reference instant; defaults to the current time.
 * @returns the UTC instant at which the current local day started.
 */
export function startOfDayInTimezone(timezone: string, now: Date = new Date()): Date {
  // `en-CA` renders as YYYY-MM-DD, giving the local calendar day as a string.
  const localDay = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  // Read the offset the zone applies at this instant, then shift midnight of the
  // local day back into UTC. Using the *current* offset (rather than one at the
  // boundary) can be off by an hour across a DST transition; the offset is
  // re-derived at the boundary to keep it exact.
  const boundary = new Date(`${localDay}T00:00:00Z`)
  const offsetMs = timezoneOffsetMs(timezone, boundary)
  return new Date(boundary.getTime() - offsetMs)
}

/**
 * Offset of a timezone from UTC at a given instant, in milliseconds.
 * @param timezone - validated IANA zone name.
 * @param at - the instant to measure at.
 * @returns milliseconds to add to UTC to get local time (e.g. +8h for Shanghai).
 */
function timezoneOffsetMs(timezone: string, at: Date): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
  const parts = formatter.formatToParts(at)
  const read = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0')
  const asLocal = Date.UTC(
    read('year'),
    read('month') - 1,
    read('day'),
    // `hour12: false` can render midnight as hour 24 in some runtimes.
    read('hour') % 24,
    read('minute'),
    read('second'),
  )
  return asLocal - at.getTime()
}

/**
 * The `YYYY-MM-DD` calendar day an instant falls on in a timezone.
 * @param timezone - validated IANA zone name.
 * @param at - the instant to project; defaults to now.
 * @returns the local calendar day key.
 */
export function localDayKey(timezone: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at)
}
