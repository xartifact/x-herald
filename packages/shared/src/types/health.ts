/** Public response from GET /api/health when the gateway and database are healthy. */
export interface GatewayHealthStatus {
  status: 'healthy'
  version: string
  commitHash: string
  /** Release tag or Git branch that produced the deployed image. */
  buildRef: string
  timestamp: string
  uptime: number
  database: 'connected'
}

/**
 * Legacy generic health shape kept for callers that only model generic probes.
 * Gateway management clients should prefer {@link GatewayHealthStatus}.
 */
export interface HealthStatus {
  status: 'ok' | 'error'
  timestamp: string
  database?: {
    status: 'connected' | 'disconnected'
  }
}
