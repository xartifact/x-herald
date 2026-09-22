import { afterEach, describe, expect, it } from 'bun:test'

import { RateLimitEngine } from './rate-limit-engine'

describe('rate limit accounting regressions', () => {
  const engine = new RateLimitEngine()
  engine.stopCleanup()

  afterEach(() => engine.reset())

  it('records over-limit consumption and blocks subsequent requests', () => {
    const config = { rpm: 10, rpd: 100, tokenLimitDaily: 100 }
    expect(engine.check('key', config).allowed).toBe(true)
    const usage = engine.check('key', {}, 120)
    expect(usage.token).toMatchObject({ current: 120, remaining: 0 })
    expect(usage.allowed).toBe(false)
    expect(engine.check('key', config).allowed).toBe(false)
    expect(engine.getStatus('key', {}).rpm?.current).toBe(1)
    engine.check('key', {}, 30)
    expect(engine.getStatus('key', {}).token?.current).toBe(150)
  })

  it('allows requests again after an overrun resets at midnight', () => {
    let now = new Date(2026, 0, 1, 23, 59).getTime()
    const timed = new RateLimitEngine(() => now)
    timed.stopCleanup()
    timed.check('key', { tokenLimitDaily: 100 }, 120)
    expect(timed.check('key', {}).allowed).toBe(false)
    now = new Date(2026, 0, 2, 0, 1).getTime()
    expect(timed.check('key', {}).allowed).toBe(true)
    expect(timed.getStatus('key', {}).token?.current).toBe(0)
  })

  for (const disabled of [null, 0]) {
    it(`removes disabled RPM (${disabled}) while retaining RPD and token usage`, () => {
      engine.check('key', { rpm: 1, rpd: 10, tokenLimitDaily: 100 })
      engine.check('key', {}, 20)
      const result = engine.check('key', { rpm: disabled, rpd: 10, tokenLimitDaily: 100 })
      expect(result.allowed).toBe(true)
      expect(result.rpm).toBeUndefined()
      expect(result.rpd?.current).toBe(2)
      expect(result.token?.current).toBe(20)
    })

    it(`removes disabled RPD and token limits (${disabled})`, () => {
      engine.check('key', { rpm: 10, rpd: 1, tokenLimitDaily: 100 })
      engine.check('key', {}, 120)
      const result = engine.check('key', { rpm: 10, rpd: disabled, tokenLimitDaily: disabled })
      expect(result.allowed).toBe(true)
      expect(result.rpm?.current).toBe(2)
      expect(result.rpd).toBeUndefined()
      expect(result.token).toBeUndefined()
    })
  }

  it('preserves configured limits during usage-only calls', () => {
    engine.check('key', { rpm: 1, rpd: 10, tokenLimitDaily: 100 })
    const result = engine.check('key', {}, 30)
    expect(result.rpm).toMatchObject({ limit: 1, current: 1 })
    expect(result.rpd).toMatchObject({ limit: 10, current: 1 })
    expect(result.token).toMatchObject({ limit: 100, current: 30 })
    expect(engine.check('key', {}).allowed).toBe(false)
  })
})
