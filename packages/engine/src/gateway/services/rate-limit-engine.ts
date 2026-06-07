export interface RateLimitConfig {
  rpm?: number | null
  rpd?: number | null
  tokenLimitDaily?: number | null
}

export interface RateLimitResult {
  allowed: boolean
  reason?: string
  rpm?: { current: number; limit: number; remaining: number; resetAt: number }
  rpd?: { current: number; limit: number; remaining: number; resetAt: number }
  token?: { current: number; limit: number; remaining: number; resetAt: number }
}

export class SlidingWindowCounter {
  private entries: Array<{ timestamp: number; count: number }> = []

  constructor(
    private windowMs: number,
    public maxRequests: number
  ) {
    if (maxRequests <= 0) {
      throw new Error('maxRequests must be positive')
    }
  }

  record(): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    this.cleanup(this.windowMs)

    const current = this.entries.reduce((sum, e) => sum + e.count, 0)
    if (current >= this.maxRequests) {
      const resetAt = this.entries[0].timestamp + this.windowMs
      return { allowed: false, remaining: 0, resetAt }
    }

    this.entries.push({ timestamp: now, count: 1 })
    const newCurrent = current + 1
    return {
      allowed: true,
      remaining: this.maxRequests - newCurrent,
      resetAt: now + this.windowMs,
    }
  }

  getStatus(): { current: number; limit: number; remaining: number; resetAt: number } {
    const now = Date.now()
    this.cleanup(this.windowMs)
    const current = this.entries.reduce((sum, e) => sum + e.count, 0)
    const resetAt = this.entries.length > 0
      ? this.entries[0].timestamp + this.windowMs
      : now + this.windowMs
    return {
      current,
      limit: this.maxRequests,
      remaining: Math.max(0, this.maxRequests - current),
      resetAt,
    }
  }

  peekStatus(): { current: number; limit: number; remaining: number; resetAt: number } {
    return this.getStatus()
  }

  cleanup(maxAgeMs: number): void {
    const cutoff = Date.now() - maxAgeMs
    const firstValid = this.entries.findIndex(e => e.timestamp > cutoff)
    if (firstValid > 0) {
      this.entries = this.entries.slice(firstValid)
    } else if (firstValid === -1) {
      this.entries = []
    }
  }
}

export class DailyAccumulator {
  private currentTokens: number = 0
  private resetAt: number

  constructor(public maxTokens: number) {
    if (maxTokens <= 0) {
      throw new Error('maxTokens must be positive')
    }
    this.resetAt = this.getNextMidnight()
  }

  private getNextMidnight(): number {
    const now = new Date()
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    return tomorrow.getTime()
  }

  private checkReset(): void {
    if (Date.now() >= this.resetAt) {
      this.currentTokens = 0
      this.resetAt = this.getNextMidnight()
    }
  }

  record(tokens: number): { allowed: boolean; remaining: number; resetAt: number } {
    this.checkReset()
    if (this.currentTokens + tokens > this.maxTokens) {
      return { allowed: false, remaining: 0, resetAt: this.resetAt }
    }
    this.currentTokens += tokens
    return {
      allowed: true,
      remaining: this.maxTokens - this.currentTokens,
      resetAt: this.resetAt,
    }
  }

  getStatus(): { current: number; limit: number; remaining: number; resetAt: number } {
    this.checkReset()
    return {
      current: this.currentTokens,
      limit: this.maxTokens,
      remaining: Math.max(0, this.maxTokens - this.currentTokens),
      resetAt: this.resetAt,
    }
  }

  reset(): void {
    this.currentTokens = 0
    this.resetAt = this.getNextMidnight()
  }
}

interface KeyCounters {
  rpm: SlidingWindowCounter | null
  rpd: SlidingWindowCounter | null
  token: DailyAccumulator | null
}

const CLEANUP_INTERVAL_MS = 60_000 // 1 minute
const CLEANUP_MAX_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

export class RateLimitEngine {
  private counters: Map<string, KeyCounters> = new Map()
  private cleanupTimer: ReturnType<typeof setInterval> | null = null

  constructor() {
    this.startCleanup()
  }

  check(keyId: string, config: RateLimitConfig, tokens?: number): RateLimitResult {
    const counters = this.getOrCreateCounters(keyId, config)
    let allowed = true
    let reason: string | undefined

    const isRequestCheck = tokens === undefined

    if (isRequestCheck) {
      // Phase 1: Peek all limits without recording
      const rpmStatus = counters.rpm?.peekStatus()
      if (rpmStatus && rpmStatus.remaining <= 0) {
        allowed = false
        reason = reason || 'RPM limit exceeded'
      }

      const rpdStatus = counters.rpd?.peekStatus()
      if (rpdStatus && rpdStatus.remaining <= 0) {
        allowed = false
        reason = reason || 'RPD limit exceeded'
      }

      const tokenStatus = counters.token?.getStatus()
      if (tokenStatus && tokenStatus.remaining <= 0) {
        allowed = false
        reason = reason || 'Daily token limit exceeded'
      }

      // Phase 2: Only record if ALL checks pass
      if (allowed) {
        counters.rpm?.record()
        counters.rpd?.record()
      }
    }

    if (counters.token && tokens) {
      const tokenResult = counters.token.record(tokens)
      if (!tokenResult.allowed) {
        allowed = false
        reason = reason || 'Daily token limit exceeded'
      }
    }

    return {
      allowed,
      reason,
      rpm: counters.rpm?.getStatus(),
      rpd: counters.rpd?.getStatus(),
      token: counters.token?.getStatus(),
    }
  }

  getStatus(keyId: string, config: RateLimitConfig): RateLimitResult {
    const counters = this.getOrCreateCounters(keyId, config)
    return {
      allowed: true,
      rpm: counters.rpm?.getStatus(),
      rpd: counters.rpd?.getStatus(),
      token: counters.token?.getStatus(),
    }
  }

  resetKey(keyId: string, window?: 'rpm' | 'rpd' | 'token' | 'all'): void {
    const counters = this.counters.get(keyId)
    if (!counters) return

    if (window === 'all' || window === undefined) {
      this.counters.delete(keyId)
    } else {
      if (window === 'rpm') counters.rpm = null
      if (window === 'rpd') counters.rpd = null
      if (window === 'token') counters.token = null

      if (!counters.rpm && !counters.rpd && !counters.token) {
        this.counters.delete(keyId)
      }
    }
  }

  private getOrCreateCounters(keyId: string, config: RateLimitConfig): KeyCounters {
    let counters = this.counters.get(keyId)
    if (!counters) {
      counters = { rpm: null, rpd: null, token: null }
      this.counters.set(keyId, counters)
    }

    if (config.rpm && !counters.rpm) {
      counters.rpm = new SlidingWindowCounter(60_000, config.rpm)
    } else if (counters.rpm && config.rpm && counters.rpm.maxRequests !== config.rpm) {
      counters.rpm.maxRequests = config.rpm
    }

    if (config.rpd && !counters.rpd) {
      counters.rpd = new SlidingWindowCounter(86_400_000, config.rpd)
    } else if (counters.rpd && config.rpd && counters.rpd.maxRequests !== config.rpd) {
      counters.rpd.maxRequests = config.rpd
    }

    if (config.tokenLimitDaily && !counters.token) {
      counters.token = new DailyAccumulator(Number(config.tokenLimitDaily))
    } else if (counters.token && config.tokenLimitDaily && counters.token.maxTokens !== config.tokenLimitDaily) {
      counters.token.maxTokens = config.tokenLimitDaily
    }

    return counters
  }

  startCleanup(intervalMs = 60_000): void {
    if (this.cleanupTimer) return
    this.cleanupTimer = setInterval(() => {
      this.cleanup()
    }, intervalMs)
  }

  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
      this.cleanupTimer = null
    }
  }

  private cleanup(): void {
    for (const [keyId, counters] of this.counters) {
      counters.rpm?.cleanup(CLEANUP_MAX_AGE_MS)
      counters.rpd?.cleanup(CLEANUP_MAX_AGE_MS)

      const rpmStatus = counters.rpm?.getStatus()
      const rpdStatus = counters.rpd?.getStatus()

      const isEmpty =
        (!counters.rpm || (rpmStatus && rpmStatus.current === 0)) &&
        (!counters.rpd || (rpdStatus && rpdStatus.current === 0)) &&
        (!counters.token || counters.token.getStatus().current === 0)

      if (isEmpty) {
        this.counters.delete(keyId)
      }
    }
  }
}

export const rateLimitEngine = new RateLimitEngine()
