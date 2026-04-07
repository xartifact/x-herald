import type { GatewayConfig } from './schema';

/**
 * Load configuration from environment variables
 */
export function loadConfig(): GatewayConfig {
  return {
    server: {
      port: parseInt(process.env.PORT || '3000'),
      host: process.env.HOST || '0.0.0.0',
      cors: {
        enabled: process.env.CORS_ENABLED !== 'false',
        origins: process.env.CORS_ORIGINS?.split(',') || ['*'],
      },
    },

    database: {
      type: (process.env.DB_TYPE as 'postgres' | 'pglite') ||
        (process.env.NODE_ENV === 'production' ? 'postgres' : 'pglite'),
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'llm_gateway',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
      dataDir: process.env.DB_DATA_DIR || './.pglite',
    },

    admin: {
      password: process.env.ADMIN_PASSWORD || 'change-me-in-production',
    },

    metrics: {
      memoryBufferSize: parseInt(process.env.METRICS_BUFFER_SIZE || '10000'),
      flushIntervalMs: parseInt(process.env.METRICS_FLUSH_INTERVAL || '300000'), // 5 minutes
      retentionDays: parseInt(process.env.METRICS_RETENTION_DAYS || '30'),
    },

    health: {
      checkIntervalMs: parseInt(process.env.HEALTH_CHECK_INTERVAL || '30000'), // 30 seconds
      timeoutMs: parseInt(process.env.HEALTH_TIMEOUT || '5000'),
      failureThreshold: parseInt(process.env.HEALTH_FAILURE_THRESHOLD || '3'),
    },

    circuitBreaker: {
      failureThreshold: parseInt(process.env.CB_FAILURE_THRESHOLD || '3'),
      timeout: parseInt(process.env.CB_TIMEOUT || '60000'), // 60 seconds
      resetTimeout: parseInt(process.env.CB_RESET_TIMEOUT || '30000'), // 30 seconds
    },

    sameProtocolPassthrough: {
      enabled: process.env.GATEWAY_SAME_PROTOCOL_PASSTHROUGH === 'true',
      allowedProtocols: ['openai', 'anthropic'],
    },

    modelMapping: {
      enabled: process.env.MODEL_MAPPING_ENABLED !== 'false',
      defaultModelGroup: process.env.MODEL_MAPPING_DEFAULT_GROUP || '',
    },

    logger: {
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      enableRequestLog: process.env.LOG_ENABLE_REQUEST !== 'false',
      enableDebug: process.env.LOG_ENABLE_DEBUG === 'true',
    },
  };
}

/**
 * Validate configuration
 */
export function validateConfig(config: GatewayConfig): void {
  // Server validation
  if (config.server.port < 1 || config.server.port > 65535) {
    throw new Error('Invalid server port');
  }

  // Database validation
  if (config.database.type === 'postgres') {
    if (!config.database.host) {
      throw new Error('Database host is required');
    }
    if (!config.database.database) {
      throw new Error('Database name is required');
    }
    if (!config.database.password && process.env.NODE_ENV === 'production') {
      console.warn('WARNING: No database password set in production!');
    }
  }

  // Admin validation
  if (config.admin.password === 'change-me-in-production' && process.env.NODE_ENV === 'production') {
    throw new Error('Admin password must be changed in production');
  }

  // Model mapping validation
  if (config.modelMapping.enabled && !config.modelMapping.defaultModelGroup) {
    console.warn('WARNING: Model mapping is enabled but defaultModelGroup is not set. Fallback will not work.');
  }
}
