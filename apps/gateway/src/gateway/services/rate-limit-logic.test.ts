import { describe, it, expect } from 'bun:test'

import { decideRateLimit, getNextMidnightMs, shouldResetDaily } from './rate-limit-logic'

describe('decideRateLimit', () => {
  it('allows request when current < maxRequests', () => {
    const entries = [{ timestamp: 1_000_000, count: 1 }]
    const result = decideRateLimit({
      entries,
      maxRequests: 3,
      windowMs: 60_000,
      now: 1_000_030,
    })
    expect(result.allowed).toBe(true)
    expect(result.current).toBe(1)
    expect(result.remaining).toBe(1)
    expect(result.resetAt).toBe(1_000_030 + 60_000)
    expect(result.cleaned).toBe(0)
  })

  it('rejects request when current >= maxRequests', () => {
    const entries = [
      { timestamp: 1_000_000, count: 1 },
      { timestamp: 1_000_010, count: 1 },
      { timestamp: 1_000_020, count: 1 },
    ]
    const result = decideRateLimit({
      entries,
      maxRequests: 3,
      windowMs: 60_000,
      now: 1_000_030,
    })
    expect(result.allowed).toBe(false)
    expect(result.current).toBe(3)
    expect(result.remaining).toBe(0)
    expect(result.resetAt).toBe(1_000_000 + 60_000)
    expect(result.cleaned).toBe(0)
  })

  it('returns remaining 0 when current equals maxRequests - 1', () => {
    const entries = [
      { timestamp: 1_000_000, count: 1 },
      { timestamp: 1_000_010, count: 1 },
    ]
    const result = decideRateLimit({
      entries,
      maxRequests: 3,
      windowMs: 60_000,
      now: 1_000_030,
    })
    expect(result.allowed).toBe(true)
    expect(result.current).toBe(2)
    expect(result.remaining).toBe(0)
  })

  it('cleans up expired entries', () => {
    const entries = [
      { timestamp: 1_000_000, count: 1 },
      { timestamp: 1_000_100, count: 1 },
    ]
    const result = decideRateLimit({
      entries,
      maxRequests: 3,
      windowMs: 60_000,
      now: 1_060_000,
    })
    expect(result.allowed).toBe(true)
    expect(result.current).toBe(1)
    expect(result.cleaned).toBe(1)
  })

  it('cleans up all expired entries', () => {
    const entries = [
      { timestamp: 1_000_000, count: 1 },
      { timestamp: 1_000_010, count: 1 },
    ]
    const result = decideRateLimit({
      entries,
      maxRequests: 3,
      windowMs: 60_000,
      now: 1_060_100,
    })
    expect(result.allowed).toBe(true)
    expect(result.current).toBe(0)
    expect(result.remaining).toBe(2)
    expect(result.cleaned).toBe(2)
  })

  it('handles empty entries', () => {
    const result = decideRateLimit({
      entries: [],
      maxRequests: 3,
      windowMs: 60_000,
      now: 1_000_000,
    })
    expect(result.allowed).toBe(true)
    expect(result.current).toBe(0)
    expect(result.remaining).toBe(2)
    expect(result.resetAt).toBe(1_000_000 + 60_000)
    expect(result.cleaned).toBe(0)
  })

  it('handles entries with count > 1', () => {
    const entries = [
      { timestamp: 1_000_000, count: 2 },
      { timestamp: 1_000_010, count: 1 },
    ]
    const result = decideRateLimit({
      entries,
      maxRequests: 3,
      windowMs: 60_000,
      now: 1_000_030,
    })
    expect(result.allowed).toBe(false)
    expect(result.current).toBe(3)
    expect(result.remaining).toBe(0)
  })

  it('returns resetAt from oldest entry when rejected', () => {
    const entries = [
      { timestamp: 1_000_000, count: 1 },
      { timestamp: 1_000_050, count: 1 },
      { timestamp: 1_000_100, count: 1 },
    ]
    const result = decideRateLimit({
      entries,
      maxRequests: 3,
      windowMs: 60_000,
      now: 1_000_150,
    })
    expect(result.allowed).toBe(false)
    expect(result.resetAt).toBe(1_000_000 + 60_000)
  })

  it('allows request when entries are exactly at boundary', () => {
    const entries = [
      { timestamp: 1_000_000, count: 1 },
      { timestamp: 1_000_060, count: 1 },
    ]
    const result = decideRateLimit({
      entries,
      maxRequests: 3,
      windowMs: 60_000,
      now: 1_060_000,
    })
    expect(result.current).toBe(1)
    expect(result.allowed).toBe(true)
    expect(result.remaining).toBe(1)
    expect(result.cleaned).toBe(1)
  })
})

describe('getNextMidnightMs', () => {
  it('returns next midnight for a given timestamp', () => {
    const now = new Date(2025, 0, 1, 12, 30, 0).getTime()
    const result = getNextMidnightMs(now)
    const expected = new Date(2025, 0, 2, 0, 0, 0).getTime()
    expect(result).toBe(expected)
  })

  it('returns next midnight for just before midnight', () => {
    const now = new Date(2025, 0, 1, 23, 59, 59, 999).getTime()
    const result = getNextMidnightMs(now)
    const expected = new Date(2025, 0, 2, 0, 0, 0).getTime()
    expect(result).toBe(expected)
  })

  it('returns next midnight for exactly midnight', () => {
    const now = new Date(2025, 0, 1, 0, 0, 0).getTime()
    const result = getNextMidnightMs(now)
    const expected = new Date(2025, 0, 2, 0, 0, 0).getTime()
    expect(result).toBe(expected)
  })

  it('handles timezone correctly', () => {
    const now = new Date(2025, 5, 15, 8, 0, 0).getTime()
    const result = getNextMidnightMs(now)
    const expected = new Date(2025, 5, 16, 0, 0, 0).getTime()
    expect(result).toBe(expected)
  })
})

describe('shouldResetDaily', () => {
  it('returns true when now >= resetAt', () => {
    expect(shouldResetDaily({ now: 1_000_000, resetAt: 1_000_000 })).toBe(true)
    expect(shouldResetDaily({ now: 1_000_001, resetAt: 1_000_000 })).toBe(true)
  })

  it('returns false when now < resetAt', () => {
    expect(shouldResetDaily({ now: 999_999, resetAt: 1_000_000 })).toBe(false)
    expect(shouldResetDaily({ now: 500_000, resetAt: 1_000_000 })).toBe(false)
  })

  it('returns false at boundary minus one', () => {
    expect(shouldResetDaily({ now: 1_000_000 - 1, resetAt: 1_000_000 })).toBe(false)
  })

  it('returns true at boundary', () => {
    expect(shouldResetDaily({ now: 1_000_000, resetAt: 1_000_000 })).toBe(true)
  })
})
