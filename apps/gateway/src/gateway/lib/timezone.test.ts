import { describe, expect, it } from 'bun:test'

import {
  DEFAULT_AGGREGATION_TIMEZONE,
  localDayKey,
  resolveTimezone,
  startOfDayInTimezone,
} from './timezone'

describe('resolveTimezone', () => {
  it('accepts a valid IANA zone', () => {
    expect(resolveTimezone('Asia/Shanghai')).toBe('Asia/Shanghai')
    expect(resolveTimezone('America/New_York')).toBe('America/New_York')
    expect(resolveTimezone('UTC')).toBe('UTC')
  })

  it('defaults to UTC when absent, blank, or unrecognized', () => {
    // An unvalidated string must never reach the SQL that interpolates it.
    expect(resolveTimezone(undefined)).toBe(DEFAULT_AGGREGATION_TIMEZONE)
    expect(resolveTimezone('')).toBe(DEFAULT_AGGREGATION_TIMEZONE)
    expect(resolveTimezone('   ')).toBe(DEFAULT_AGGREGATION_TIMEZONE)
    expect(resolveTimezone('Not/AZone')).toBe(DEFAULT_AGGREGATION_TIMEZONE)
    // Injection-shaped input is rejected the same way.
    expect(resolveTimezone("UTC'; DROP TABLE logs; --")).toBe(DEFAULT_AGGREGATION_TIMEZONE)
  })

  it('trims surrounding whitespace on a valid value', () => {
    expect(resolveTimezone('  Asia/Shanghai  ')).toBe('Asia/Shanghai')
  })
})

describe('startOfDayInTimezone', () => {
  it('returns midnight in the requested zone, not the process zone', () => {
    // 2026-03-05T23:30Z is already 2026-03-06 07:30 in Shanghai, so that zone's
    // day began at 2026-03-05T16:00Z — the boundary the server-zone version missed.
    const at = new Date('2026-03-05T23:30:00.000Z')
    expect(startOfDayInTimezone('Asia/Shanghai', at).toISOString()).toBe(
      '2026-03-05T16:00:00.000Z',
    )
    expect(startOfDayInTimezone('UTC', at).toISOString()).toBe('2026-03-05T00:00:00.000Z')
  })

  it('gives different boundaries to zones on different days', () => {
    // The same instant belongs to different local days either side of the date
    // line; the boundaries must therefore differ.
    const at = new Date('2026-03-05T23:30:00.000Z')
    const shanghai = startOfDayInTimezone('Asia/Shanghai', at)
    const newYork = startOfDayInTimezone('America/New_York', at)
    expect(shanghai.getTime()).not.toBe(newYork.getTime())
    // New York is 5h behind UTC in March, so its day began at 05:00Z.
    expect(newYork.toISOString()).toBe('2026-03-05T05:00:00.000Z')
  })

  it('handles a negative-offset zone', () => {
    const at = new Date('2026-03-05T02:00:00.000Z')
    // 2026-03-04 21:00 in New York, so the local day started 2026-03-04T05:00Z.
    expect(startOfDayInTimezone('America/New_York', at).toISOString()).toBe(
      '2026-03-04T05:00:00.000Z',
    )
  })

  it('tracks the offset across a DST transition', () => {
    // US DST began 2026-03-08. A March 9 instant is EDT (-4), not EST (-5).
    const beforeDst = new Date('2026-03-07T12:00:00.000Z')
    const afterDst = new Date('2026-03-09T12:00:00.000Z')
    expect(startOfDayInTimezone('America/New_York', beforeDst).toISOString()).toBe(
      '2026-03-07T05:00:00.000Z',
    )
    expect(startOfDayInTimezone('America/New_York', afterDst).toISOString()).toBe(
      '2026-03-09T04:00:00.000Z',
    )
  })

  it('never returns a boundary after the instant it was computed for', () => {
    const at = new Date('2026-03-05T23:30:00.000Z')
    for (const zone of ['UTC', 'Asia/Shanghai', 'America/New_York', 'Pacific/Auckland']) {
      expect(startOfDayInTimezone(zone, at).getTime()).toBeLessThanOrEqual(at.getTime())
    }
  })
})

describe('localDayKey', () => {
  it('reports the local calendar day', () => {
    const at = new Date('2026-03-05T23:30:00.000Z')
    expect(localDayKey('UTC', at)).toBe('2026-03-05')
    expect(localDayKey('Asia/Shanghai', at)).toBe('2026-03-06')
    expect(localDayKey('America/New_York', at)).toBe('2026-03-05')
  })
})
