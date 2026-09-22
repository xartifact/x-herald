export const PROVIDER_TYPES = {
  EXTERNAL: 'external',
  SYSTEM: 'system',
} as const

export const ROUTING_STRATEGIES = {
  ROUND_ROBIN: 'round_robin',
  WEIGHTED: 'weighted',
  LEAST_RESPONSE_TIME: 'least_response_time',
  PRIORITY: 'priority',
  SMART: 'smart',
} as const

export const PROTOCOLS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
} as const

export const REQUEST_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
} as const

export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  DOWN: 'down',
} as const

export const CIRCUIT_BREAKER_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
} as const

export const DEFAULTS = {
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 3,
    TIMEOUT: 60000,
    RESET_TIMEOUT: 30000,
  },
  TTFB_TIMEOUT: {
    TOTAL_STREAMING_MS: 90_000,
    TOTAL_NON_STREAMING_MS: 60_000,
    ATTEMPT_STREAMING_MS: 60_000,
    ATTEMPT_NON_STREAMING_MS: 30_000,
    MIN_ATTEMPT_MS: 30_000,
    BASELINE_MULTIPLIER: 2,
    CONNECT_TIMEOUT_MS: 30_000,
  },
} as const
export const CATCHALL_VM_NAME = '__catchall__'

// Engine env constants (shared for client use).
//
// `process.env` is read as a direct expression on purpose: Vite's `define`
// substitutes `process.env` textually, so an indirection — `globalThis.process`
// included — is invisible to it, and every build-time value silently fell back
// to its default in the browser bundle. The direct form is what lets `define`
// reach these constants; under Bun/Node the global exists natively.
function getEnv(key: string): string | undefined {
  const env = process.env
  if (!env) return undefined
  const value = env[key]
  return typeof value === 'string' ? value : undefined
}

export const APP_VERSION = getEnv('APP_VERSION') || 'dev'
export const GIT_COMMIT_HASH = getEnv('GIT_COMMIT_HASH') || 'unknown'
/** Git ref that produced this build: a release tag or deployment branch. */
export const BUILD_REF = getEnv('BUILD_REF') || 'unknown'
export const IS_DEVELOPMENT = getEnv('NODE_ENV') !== 'production'
export const IS_PRODUCTION = getEnv('NODE_ENV') === 'production'
export const ENABLE_LOG_CLEANUP = getEnv('ENABLE_LOG_CLEANUP') === 'true'
// Keeps a waiting stream snapshot from leaking forever before its first response.
export const STREAM_WAITING_TIMEOUT_MS = 10 * 60 * 1000
// Event-bus-only stale snapshot cleanup; it is intentionally longer than request timeout.
export const STREAM_EVENT_BUS_STALE_TIMEOUT_MS = 30 * 60 * 1000
// Terminates an individual upstream response that stops yielding chunks.
export const UPSTREAM_STREAM_IDLE_TIMEOUT_MS = 120_000
