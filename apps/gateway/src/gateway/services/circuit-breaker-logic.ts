export interface CircuitBreakerDecision {
  nextState: 'closed' | 'open' | 'half_open' | 'cooldown'
  openUntil: number
  cooldownUntil: number
  tripCount: number
  reason: string | null
  shouldFailover: boolean
}

export function decideStateTransition(params: {
  currentState: 'closed' | 'open' | 'half_open' | 'cooldown'
  currentFailures: number
  currentTripCount: number
  currentOpenUntil: number
  currentCooldownUntil: number
  now: number
  failureThreshold: number
  openDurationMs: number
  maxBackoffMs: number
  maxTripsBeforeCooldown: number
  cooldownDurationMs: number
}): CircuitBreakerDecision {
  const {
    currentState,
    currentFailures,
    currentTripCount,
    currentOpenUntil,
    currentCooldownUntil,
    now,
    failureThreshold,
    openDurationMs,
    maxBackoffMs,
    maxTripsBeforeCooldown,
    cooldownDurationMs,
  } = params

  if (currentState === 'open') {
    if (now >= currentOpenUntil) {
      return {
        nextState: 'half_open',
        openUntil: 0,
        cooldownUntil: 0,
        tripCount: currentTripCount,
        reason: null,
        shouldFailover: false,
      }
    }
    return {
      nextState: 'open',
      openUntil: currentOpenUntil,
      cooldownUntil: 0,
      tripCount: currentTripCount,
      reason: null,
      shouldFailover: true,
    }
  }

  if (currentState === 'cooldown') {
    if (now >= currentCooldownUntil) {
      return {
        nextState: 'half_open',
        openUntil: 0,
        cooldownUntil: 0,
        tripCount: 1,
        reason: null,
        shouldFailover: false,
      }
    }
    return {
      nextState: 'cooldown',
      openUntil: 0,
      cooldownUntil: currentCooldownUntil,
      tripCount: currentTripCount,
      reason: null,
      shouldFailover: true,
    }
  }

  if (currentState === 'half_open') {
    if (currentTripCount >= maxTripsBeforeCooldown) {
      return {
        nextState: 'cooldown',
        openUntil: 0,
        cooldownUntil: now + cooldownDurationMs,
        tripCount: currentTripCount,
        reason: 'max_trips_reached',
        shouldFailover: true,
      }
    }
    const backoffMs = calculateBackoffPure(openDurationMs, currentTripCount, maxBackoffMs)
    return {
      nextState: 'open',
      openUntil: now + backoffMs,
      cooldownUntil: 0,
      tripCount: currentTripCount,
      reason: 'probe_failed',
      shouldFailover: true,
    }
  }

  if (currentFailures >= failureThreshold) {
    return {
      nextState: 'open',
      openUntil: now + openDurationMs,
      cooldownUntil: 0,
      tripCount: 1,
      reason: 'failure_threshold_reached',
      shouldFailover: true,
    }
  }

  return {
    nextState: 'closed',
    openUntil: 0,
    cooldownUntil: 0,
    tripCount: currentTripCount,
    reason: null,
    shouldFailover: false,
  }
}

function calculateBackoffPure(baseMs: number, tripCount: number, maxMs: number): number {
  if (tripCount <= 1) return baseMs
  return Math.min(baseMs * Math.pow(2, tripCount - 1), maxMs)
}
