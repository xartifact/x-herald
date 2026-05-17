export interface Stats {
  todayOpened: number
  weekOpened: number
  trippedInstanceCount: number
  topInstances: Array<{
    instanceId: string
    instanceName: string
    groupName: string
    providerName: string
    openCount: number
    lastOpenedAt: string
    tripCount: number
  }>
}

export interface CBEvent {
  id: string
  instanceId: string
  instanceName: string
  groupName: string
  providerName: string
  event: 'opened' | 'half_open' | 'closed' | 'cooldown' | 'reset' | 'manual_trip'
  failureCount: number
  openUntil: string | null
  createdAt: string
}

export interface RealtimeState {
  instanceId: string
  state: 'closed' | 'open' | 'half_open' | 'cooldown'
  tripCount: number
  failures: number
  remainingMs: number
  openUntil: number
  cooldownUntil: number
}
