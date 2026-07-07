export function decideRateLimit(params: {
  entries: Array<{ timestamp: number; count: number }>
  maxRequests: number
  windowMs: number
  now: number
}): { allowed: boolean; current: number; remaining: number; resetAt: number; cleaned: number } {
  const cutoff = params.now - params.windowMs
  const filtered = params.entries.filter((e) => e.timestamp > cutoff)
  const cleaned = params.entries.length - filtered.length
  const current = filtered.reduce((sum, e) => sum + e.count, 0)

  if (current >= params.maxRequests) {
    const resetAt = filtered[0].timestamp + params.windowMs
    return { allowed: false, current, remaining: 0, resetAt, cleaned }
  }

  return {
    allowed: true,
    current,
    remaining: params.maxRequests - current - 1,
    resetAt: params.now + params.windowMs,
    cleaned,
  }
}

export function getNextMidnightMs(now: number): number {
  const d = new Date(now)
  const tomorrow = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  return tomorrow.getTime()
}

export function shouldResetDaily(params: { now: number; resetAt: number }): boolean {
  return params.now >= params.resetAt
}
