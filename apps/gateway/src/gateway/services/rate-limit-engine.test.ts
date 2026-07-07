import { describe, it, expect, beforeEach, afterEach } from 'bun:test'

import { SlidingWindowCounter, DailyAccumulator, RateLimitEngine } from './rate-limit-engine'

const originalDateNow = Date.now
let mockNow = 1_000_000_000_000

describe('SlidingWindowCounter', () => {
  let counter: SlidingWindowCounter

  beforeEach(() => {
    mockNow = 1_000_000_000_000
    Date.now = () => mockNow
    counter = new SlidingWindowCounter(1000, 3)
  })

  afterEach(() => {
    Date.now = originalDateNow
  })

  it('allows requests within limit', () => {
    const r1 = counter.record()
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(2)

    const r2 = counter.record()
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(1)

    const r3 = counter.record()
    expect(r3.allowed).toBe(true)
    expect(r3.remaining).toBe(0)
  })

  it('rejects requests over limit', () => {
    counter.record()
    counter.record()
    counter.record()

    const r4 = counter.record()
    expect(r4.allowed).toBe(false)
    expect(r4.remaining).toBe(0)
  })

  it('resets after window expires', () => {
    counter.record()
    counter.record()
    counter.record()

    const r4 = counter.record()
    expect(r4.allowed).toBe(false)

    mockNow += 1001

    const r5 = counter.record()
    expect(r5.allowed).toBe(true)
    expect(r5.remaining).toBe(2)
  })

  it('returns correct status', () => {
    counter.record()
    counter.record()

    const status = counter.getStatus()
    expect(status.current).toBe(2)
    expect(status.limit).toBe(3)
    expect(status.remaining).toBe(1)
  })

  it('cleans up old entries', () => {
    counter.record()
    mockNow += 1001
    counter.record()

    counter.cleanup(1000)
    const status = counter.getStatus()
    expect(status.current).toBe(1)
  })

  it('peekStatus returns same values as getStatus without recording', () => {
    counter.record()
    counter.record()

    const peek = counter.peekStatus()
    const status = counter.getStatus()

    expect(peek.current).toBe(status.current)
    expect(peek.limit).toBe(status.limit)
    expect(peek.remaining).toBe(status.remaining)
    expect(peek.resetAt).toBe(status.resetAt)
  })

  it('peekStatus does not record a new request', () => {
    counter.record()

    const peek1 = counter.peekStatus()
    const peek2 = counter.peekStatus()

    expect(peek1.current).toBe(1)
    expect(peek2.current).toBe(1)
  })

  it('throws on zero or negative maxRequests', () => {
    expect(() => new SlidingWindowCounter(1000, 0)).toThrow('maxRequests must be positive')
    expect(() => new SlidingWindowCounter(1000, -1)).toThrow('maxRequests must be positive')
  })

  it('entries within the same window are grouped correctly', () => {
    counter.record()
    mockNow += 500
    counter.record()

    const status = counter.getStatus()
    expect(status.current).toBe(2)
    expect(status.remaining).toBe(1)

    mockNow += 501
    counter.cleanup(1000)
    const status2 = counter.getStatus()
    expect(status2.current).toBe(1)
  })
})

describe('DailyAccumulator', () => {
  let accumulator: DailyAccumulator

  beforeEach(() => {
    accumulator = new DailyAccumulator(1000)
  })

  it('accumulates tokens within limit', () => {
    const r1 = accumulator.record(300)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(700)

    const r2 = accumulator.record(400)
    expect(r2.allowed).toBe(true)
    expect(r2.remaining).toBe(300)
  })

  it('rejects when exceeding limit', () => {
    accumulator.record(800)
    const r2 = accumulator.record(300)
    expect(r2.allowed).toBe(false)
    expect(r2.remaining).toBe(0)
  })

  it('handles exact limit', () => {
    const r1 = accumulator.record(1000)
    expect(r1.allowed).toBe(true)
    expect(r1.remaining).toBe(0)

    const r2 = accumulator.record(1)
    expect(r2.allowed).toBe(false)
  })

  it('resets at midnight', () => {
    // Mock Date to just before midnight
    const realDate = Date
    const mockNow = new Date(2025, 0, 1, 23, 59, 59, 0).getTime()
    global.Date = class extends Date {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(mockNow)
        } else if (args.length === 1) {
          super(args[0] as string | number)
        } else if (args.length === 2) {
          super(args[0] as number, args[1] as number)
        } else if (args.length === 3) {
          super(args[0] as number, args[1] as number, args[2] as number)
        } else {
          super(args[0] as number, args[1] as number, args[2] as number, args[3] as number)
        }
      }
      static now() {
        return mockNow
      }
    } as DateConstructor

    const acc = new DailyAccumulator(100)
    acc.record(50)
    expect(acc.getStatus().current).toBe(50)

    // Move past midnight
    const afterMidnight = new Date(2025, 0, 2, 0, 0, 1, 0).getTime()
    global.Date = class extends Date {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(afterMidnight)
        } else if (args.length === 1) {
          super(args[0] as string | number)
        } else if (args.length === 2) {
          super(args[0] as number, args[1] as number)
        } else if (args.length === 3) {
          super(args[0] as number, args[1] as number, args[2] as number)
        } else {
          super(args[0] as number, args[1] as number, args[2] as number, args[3] as number)
        }
      }
      static now() {
        return afterMidnight
      }
    } as DateConstructor

    expect(acc.getStatus().current).toBe(0)
    const r = acc.record(60)
    expect(r.allowed).toBe(true)

    global.Date = realDate
  })

  it('getStatus returns correct values', () => {
    accumulator.record(250)
    const status = accumulator.getStatus()
    expect(status.current).toBe(250)
    expect(status.limit).toBe(1000)
    expect(status.remaining).toBe(750)
  })

  it('reset clears tokens', () => {
    accumulator.record(500)
    accumulator.reset()
    const status = accumulator.getStatus()
    expect(status.current).toBe(0)
    expect(status.remaining).toBe(1000)
  })

  it('throws on zero or negative maxTokens', () => {
    expect(() => new DailyAccumulator(0)).toThrow('maxTokens must be positive')
    expect(() => new DailyAccumulator(-1)).toThrow('maxTokens must be positive')
  })
})

describe('RateLimitEngine', () => {
  let engine: RateLimitEngine

  beforeEach(() => {
    engine = new RateLimitEngine()
  })

  afterEach(() => {
    engine.stopCleanup()
    engine.resetKey('test-key', 'all')
  })

  it('allows request when no limits configured', () => {
    const result = engine.check('test-key', {})
    expect(result.allowed).toBe(true)
  })

  it('checks RPM limit', () => {
    const result = engine.check('test-key', { rpm: 2 })
    expect(result.allowed).toBe(true)
    expect(result.rpm?.remaining).toBe(1)

    const r2 = engine.check('test-key', { rpm: 2 })
    expect(r2.allowed).toBe(true)
    expect(r2.rpm?.remaining).toBe(0)

    const r3 = engine.check('test-key', { rpm: 2 })
    expect(r3.allowed).toBe(false)
    expect(r3.reason).toBe('RPM limit exceeded')
  })

  it('checks RPD limit', () => {
    const result = engine.check('test-key', { rpd: 2 })
    expect(result.allowed).toBe(true)
    expect(result.rpd?.remaining).toBe(1)

    const r2 = engine.check('test-key', { rpd: 2 })
    expect(r2.allowed).toBe(true)

    const r3 = engine.check('test-key', { rpd: 2 })
    expect(r3.allowed).toBe(false)
    expect(r3.reason).toBe('RPD limit exceeded')
  })

  it('checks daily token limit', () => {
    const result = engine.check('test-key', { tokenLimitDaily: 100 })
    expect(result.allowed).toBe(true)
    expect(result.token?.remaining).toBe(100)
  })

  it('records token usage', () => {
    engine.check('test-key', { tokenLimitDaily: 100 })
    const result = engine.check('test-key', {}, 50)
    expect(result.allowed).toBe(true)
    expect(result.token?.remaining).toBe(50)

    const r2 = engine.check('test-key', {}, 60)
    expect(r2.allowed).toBe(false)
    expect(r2.reason).toBe('Daily token limit exceeded')
  })

  it('blocks request when token limit exhausted', () => {
    engine.check('test-key', { tokenLimitDaily: 100 })
    engine.check('test-key', {}, 100)

    const result = engine.check('test-key', { tokenLimitDaily: 100 })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('Daily token limit exceeded')
  })

  it('returns correct status', () => {
    engine.check('test-key', { rpm: 5, rpd: 100, tokenLimitDaily: 1000 })
    engine.check('test-key', {}, 100)

    const status = engine.getStatus('test-key', { rpm: 5, rpd: 100, tokenLimitDaily: 1000 })
    expect(status.allowed).toBe(true)
    expect(status.rpm?.current).toBe(1)
    expect(status.rpd?.current).toBe(1)
    expect(status.token?.current).toBe(100)
  })

  it('resets key counters', () => {
    engine.check('test-key', { rpm: 2, rpd: 2, tokenLimitDaily: 100 })
    engine.check('test-key', {}, 50)

    engine.resetKey('test-key', 'rpm')
    const status1 = engine.getStatus('test-key', { rpm: 2, rpd: 2, tokenLimitDaily: 100 })
    expect(status1.rpm?.current).toBe(0)
    expect(status1.rpd?.current).toBe(1)
    expect(status1.token?.current).toBe(50)

    engine.resetKey('test-key', 'all')
    const status2 = engine.getStatus('test-key', { rpm: 2, rpd: 2, tokenLimitDaily: 100 })
    expect(status2.rpm?.current).toBe(0)
    expect(status2.rpd?.current).toBe(0)
    expect(status2.token?.current).toBe(0)
  })

  it('handles combined limits - RPM first', () => {
    engine.check('test-key', { rpm: 1, rpd: 10, tokenLimitDaily: 1000 })

    const r2 = engine.check('test-key', { rpm: 1, rpd: 10, tokenLimitDaily: 1000 })
    expect(r2.allowed).toBe(false)
    expect(r2.reason).toBe('RPM limit exceeded')
    expect(r2.rpm?.remaining).toBe(0)
  })

  it('handles combined limits - RPD after RPM', () => {
    // Use different keys to isolate
    engine.check('test-key-rpd', { rpm: 10, rpd: 1, tokenLimitDaily: 1000 })

    const r2 = engine.check('test-key-rpd', { rpm: 10, rpd: 1, tokenLimitDaily: 1000 })
    expect(r2.allowed).toBe(false)
    expect(r2.reason).toBe('RPD limit exceeded')
  })

  it('handles combined limits - token after RPD', () => {
    engine.check('test-key-token', { rpm: 10, rpd: 10, tokenLimitDaily: 50 })
    engine.check('test-key-token', {}, 50)

    const result = engine.check('test-key-token', { rpm: 10, rpd: 10, tokenLimitDaily: 50 })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('Daily token limit exceeded')
  })

  it('does not count request when only recording tokens', () => {
    engine.check('test-key', { rpm: 2 })

    engine.check('test-key', {}, 10)
    const status = engine.getStatus('test-key', { rpm: 2 })
    expect(status.rpm?.current).toBe(1)
  })

  it('returns headers info for rate-limited responses', () => {
    engine.check('test-key', { rpm: 1 })
    const result = engine.check('test-key', { rpm: 1 })

    expect(result.allowed).toBe(false)
    expect(result.rpm?.limit).toBe(1)
    expect(result.rpm?.remaining).toBe(0)
    expect(result.rpm?.resetAt).toBeGreaterThan(Date.now())
  })

  it('does not increment RPM/RPD when token limit blocks request', () => {
    // Exhaust token limit first
    engine.check('test-key', { tokenLimitDaily: 100 }, 100)

    // Now make a request check - should be blocked by token limit
    const result = engine.check('test-key', { rpm: 10, rpd: 10, tokenLimitDaily: 100 })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('Daily token limit exceeded')

    // RPM and RPD should NOT have been incremented
    const status = engine.getStatus('test-key', { rpm: 10, rpd: 10, tokenLimitDaily: 100 })
    expect(status.rpm?.current).toBe(0)
    expect(status.rpd?.current).toBe(0)
  })

  it('does not increment RPD when RPM limit blocks request', () => {
    engine.check('test-key', { rpm: 1, rpd: 10 })

    // RPM limit exhausted - RPD should not be incremented
    const result = engine.check('test-key', { rpm: 1, rpd: 10 })
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe('RPM limit exceeded')

    const status = engine.getStatus('test-key', { rpm: 1, rpd: 10 })
    expect(status.rpd?.current).toBe(1)
  })

  it('updates counter limit when config changes', () => {
    engine.check('test-key', { rpm: 5 })
    const status1 = engine.getStatus('test-key', { rpm: 5 })
    expect(status1.rpm?.limit).toBe(5)
    expect(status1.rpm?.remaining).toBe(4)

    const status2 = engine.getStatus('test-key', { rpm: 3 })
    expect(status2.rpm?.limit).toBe(3)
    expect(status2.rpm?.remaining).toBe(2) // 1 used, limit now 3
  })

  it('skips counter creation when config value is zero', () => {
    const result = engine.check('test-key', { rpm: 0, rpd: 0, tokenLimitDaily: 0 })
    expect(result.allowed).toBe(true)
    expect(result.rpm).toBeUndefined()
    expect(result.rpd).toBeUndefined()
    expect(result.token).toBeUndefined()
  })

  it('stopCleanup does not throw and prevents timer leaks', () => {
    engine.stopCleanup()
    // Should be able to call multiple times without error
    engine.stopCleanup()

    // Engine should still work after stopping cleanup
    const result = engine.check('test-key', { rpm: 2 })
    expect(result.allowed).toBe(true)
  })
})
