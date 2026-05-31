// API response types for circuit breaker — serialized (dates as strings, not Date objects)
// These are distinct from engine's Drizzle DB row types which use Date

export type CircuitBreakerState = 'closed' | 'open' | 'half_open' | 'cooldown'

export interface CircuitBreakerRealtimeState {
  instanceId: string
  state: CircuitBreakerState
  tripCount: number
  failures: number
  remainingMs: number
  openUntil: number
  cooldownUntil: number
}

export interface CircuitBreakerTopInstance {
  instanceId: string
  instanceName: string
  groupName: string
  providerName: string
  openCount: number
  lastOpenedAt: string
  tripCount: number
}

export interface CircuitBreakerStats {
  todayOpened: number
  weekOpened: number
  trippedInstanceCount: number
  topInstances: CircuitBreakerTopInstance[]
}

export type CircuitBreakerEventType = 'opened' | 'half_open' | 'closed' | 'cooldown' | 'reset' | 'manual_trip'

export interface CircuitBreakerEventResponse {
  id: string
  instanceId: string
  instanceName: string
  groupName: string
  providerName: string
  event: CircuitBreakerEventType
  failureCount: number
  tripCount: number
  openUntil: string | null
  createdAt: string
}

export interface CircuitBreakerEventListResponse {
  events: CircuitBreakerEventResponse[]
  total: number
  limit: number
  offset: number
}