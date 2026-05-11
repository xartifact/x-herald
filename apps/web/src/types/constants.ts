// Provider Types
export const PROVIDER_TYPES = {
  EXTERNAL: 'external',
  SYSTEM: 'system',
} as const;

// Routing Strategies
export const ROUTING_STRATEGIES = {
  ROUND_ROBIN: 'round_robin',
  WEIGHTED: 'weighted',
  LEAST_RESPONSE_TIME: 'least_response_time',
  PRIORITY: 'priority',
  SMART: 'smart',
} as const;

// Protocol Types
export const PROTOCOLS = {
  OPENAI: 'openai',
  ANTHROPIC: 'anthropic',
  GEMINI: 'gemini',
} as const;

// Request Status
export const REQUEST_STATUS = {
  SUCCESS: 'success',
  FAILURE: 'failure',
} as const;

// Health Status
export const HEALTH_STATUS = {
  HEALTHY: 'healthy',
  DEGRADED: 'degraded',
  DOWN: 'down',
} as const;

// Health Target Types
export const HEALTH_TARGET_TYPES = {
  MODEL: 'model',
  VIRTUAL_MODEL: 'virtual_model',
} as const;

// Circuit Breaker States
export const CIRCUIT_BREAKER_STATES = {
  CLOSED: 'closed',
  OPEN: 'open',
  HALF_OPEN: 'half_open',
} as const;

// Default Values
export const DEFAULTS = {
  PROVIDER: {
    PRIORITY: 0,
    WEIGHT: 100,
    TIMEOUT_MS: 30000,
  },
  CIRCUIT_BREAKER: {
    FAILURE_THRESHOLD: 3,
    TIMEOUT: 60000,
    RESET_TIMEOUT: 30000,
  },
  HEALTH_CHECK: {
    INTERVAL_SECONDS: 300,
    TIMEOUT_MS: 5000,
    CHECK_PROMPT: 'Say "OK"',
  },
  METRICS: {
    MEMORY_BUFFER_SIZE: 10000,
    FLUSH_INTERVAL_MS: 5 * 60 * 1000,
    RETENTION_DAYS: 30,
  },
} as const;

// API Routes
export const API_ROUTES = {
  HEALTH: '/health',
  PROXY: '/v1',
  ADMIN: '/api/admin',
  PUBLIC: '/api/public',
} as const;
