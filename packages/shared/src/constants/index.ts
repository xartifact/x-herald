export const PROVIDER_TYPES = {
  EXTERNAL: 'external',
  SYSTEM: 'system',
} as const;

export const ROUTING_STRATEGIES = {
  ROUND_ROBIN: 'round_robin',
  WEIGHTED: 'weighted',
  LEAST_RESPONSE_TIME: 'least_response_time',
  PRIORITY: 'priority',
  SMART: 'smart',
} as const;

export const PROTOCOLS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
} as const;

export const REQUEST_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
} as const;

export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  DOWN: 'down',
} as const;

export const CIRCUIT_BREAKER_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
} as const;

export const DEFAULTS = {
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 3,
    TIMEOUT: 60000,
    RESET_TIMEOUT: 30000,
  },
} as const;
export const CATCHALL_VM_NAME = '__catchall__';
// Engine env constants (shared for client use)
export const APP_VERSION = typeof process !== 'undefined' ? process.env.APP_VERSION || 'dev' : 'dev';
export const IS_DEVELOPMENT = typeof process !== 'undefined' ? process.env.NODE_ENV !== 'production' : false;
export const IS_PRODUCTION = typeof process !== 'undefined' ? process.env.NODE_ENV === 'production' : false;
export const ENABLE_LOG_CLEANUP = typeof process !== 'undefined' ? process.env.ENABLE_LOG_CLEANUP === 'true' : false;
