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

// Engine env constants (shared for client use)
// Avoid direct `process` global so this file stays typable without @types/node.
const globalProcess = (globalThis as Record<string, unknown>).process as
  | Record<string, unknown>
  | undefined

function getEnv(key: string): string | undefined {
  if (typeof globalProcess === 'undefined') return undefined
  const env = globalProcess.env as Record<string, unknown> | undefined
  if (!env) return undefined
  const value = env[key]
  return typeof value === 'string' ? value : undefined
}

export const APP_VERSION = getEnv('APP_VERSION') || 'dev'
export const GIT_COMMIT_HASH = getEnv('GIT_COMMIT_HASH') || 'unknown'
export const IS_DEVELOPMENT = getEnv('NODE_ENV') !== 'production'
export const IS_PRODUCTION = getEnv('NODE_ENV') === 'production'
export const ENABLE_LOG_CLEANUP = getEnv('ENABLE_LOG_CLEANUP') === 'true'
