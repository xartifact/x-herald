import { describe, expect, it } from 'bun:test'

import {
  formatDate,
  formatDateTime,
  formatRelative,
  formatTime,
  getUserTimezone,
  isValidTimezone,
  toLocalDateKey,
  toUTCISO,
} from './datetime'

/** 2026-03-05T23:30:00Z — a moment that falls on different days in different zones. */
const CROSS_MIDNIGHT_UTC = '2026-03-05T23:30:00.000Z'

describe('formatDateTime / formatDate / formatTime', () => {
  it('renders the wall clock of the requested timezone, not the runtime one', () => {
    // The whole point of the module: the same instant must read as different
    // wall clocks depending on the viewer's zone.
    const shanghai = formatDateTime(CROSS_MIDNIGHT_UTC, { timezone: 'Asia/Shanghai' })
    const newYork = formatDateTime(CROSS_MIDNIGHT_UTC, { timezone: 'America/New_York' })
    expect(shanghai).toContain('2026')
    expect(shanghai).not.toBe(newYork)
  })

  it('honours the locale for field order and separators', () => {
    const iso = '2026-03-05T10:00:00.000Z'
    const en = formatDate(iso, { locale: 'en-US', timezone: 'UTC' })
    const de = formatDate(iso, { locale: 'de-DE', timezone: 'UTC' })
    // Same fields, different presentation — proving locale is actually applied.
    expect(en).toContain('2026')
    expect(de).toContain('2026')
    expect(en).not.toBe(de)
  })

  it('formats time independently of the calendar date', () => {
    const time = formatTime('2026-03-05T10:00:00.000Z', { timezone: 'UTC' })
    expect(time).toContain('10')
    expect(time).not.toContain('2026')
  })

  it('accepts Date, epoch millis and ISO strings interchangeably', () => {
    const date = new Date('2026-03-05T10:00:00.000Z')
    const options = { timezone: 'UTC' } as const
    const expected = formatDateTime(date, options)
    expect(formatDateTime(date.getTime(), options)).toBe(expected)
    expect(formatDateTime(date.toISOString(), options)).toBe(expected)
  })

  it('returns the fallback for absent or unparseable input instead of throwing', () => {
    // Log rows legitimately carry null timestamps; a formatter must not be the
    // thing that crashes a page.
    expect(formatDateTime(null)).toBe('-')
    expect(formatDateTime(undefined)).toBe('-')
    expect(formatDateTime('not-a-date')).toBe('-')
    expect(formatDate(null, {}, 'N/A')).toBe('N/A')
    expect(formatTime(undefined, {}, 'N/A')).toBe('N/A')
  })
})

describe('formatRelative', () => {
  const now = '2026-03-05T12:00:00.000Z'

  it('uses the largest sensible unit', () => {
    const twoHoursAgo = '2026-03-05T10:00:00.000Z'
    expect(formatRelative(twoHoursAgo, { locale: 'en' }, now)).toBe('2 hours ago')
  })

  it('reads forward-looking timestamps as future', () => {
    const inThreeDays = '2026-03-08T12:00:00.000Z'
    expect(formatRelative(inThreeDays, { locale: 'en' }, now)).toBe('in 3 days')
  })

  it('localizes the output', () => {
    const oneMinuteAgo = '2026-03-05T11:59:00.000Z'
    const zh = formatRelative(oneMinuteAgo, { locale: 'zh-CN' }, now)
    expect(zh).not.toBe('1 minute ago')
    expect(zh.length).toBeGreaterThan(0)
  })

  it('returns the fallback for bad input', () => {
    expect(formatRelative(null, {}, now)).toBe('-')
    expect(formatRelative('nope', {}, now)).toBe('-')
  })
})

describe('toLocalDateKey', () => {
  it('buckets by the local day, not the UTC day', () => {
    // 23:30 UTC is already the NEXT day in Asia/Shanghai. Using
    // `toISOString().slice(0,10)` here would put the row in the wrong bucket —
    // the bug the date filters hit for requests between 00:00 and 08:00 CST.
    expect(toLocalDateKey(CROSS_MIDNIGHT_UTC, { timezone: 'UTC' })).toBe('2026-03-05')
    expect(toLocalDateKey(CROSS_MIDNIGHT_UTC, { timezone: 'Asia/Shanghai' })).toBe('2026-03-06')
  })

  it('produces a sortable YYYY-MM-DD key regardless of locale', () => {
    const key = toLocalDateKey('2026-03-05T10:00:00.000Z', { timezone: 'UTC', locale: 'zh-CN' })
    expect(key).toBe('2026-03-05')
  })

  it('returns the fallback for bad input', () => {
    expect(toLocalDateKey(null)).toBe('')
    expect(toLocalDateKey('nope', {}, 'unknown')).toBe('unknown')
  })
})

describe('toUTCISO', () => {
  it('normalizes any accepted input to a canonical UTC string', () => {
    const iso = '2026-03-05T10:00:00.000Z'
    expect(toUTCISO(iso)).toBe(iso)
    expect(toUTCISO(new Date(iso))).toBe(iso)
    expect(toUTCISO(new Date(iso).getTime())).toBe(iso)
  })

  it('returns the fallback for bad input', () => {
    expect(toUTCISO(null)).toBe('')
    expect(toUTCISO('nope', 'fallback')).toBe('fallback')
  })
})

describe('timezone helpers', () => {
  it('reports an IANA zone for the runtime', () => {
    const tz = getUserTimezone()
    expect(tz.length).toBeGreaterThan(0)
    expect(isValidTimezone(tz)).toBe(true)
  })

  it('rejects unknown zones so a client value never reaches SQL', () => {
    expect(isValidTimezone('Asia/Shanghai')).toBe(true)
    expect(isValidTimezone('UTC')).toBe(true)
    expect(isValidTimezone('Not/AZone')).toBe(false)
    expect(isValidTimezone('')).toBe(false)
  })
})
