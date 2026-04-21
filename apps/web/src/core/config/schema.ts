export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    enabled: boolean;
    origins: string[];
  };
}

export interface DatabaseConfig {
  type: 'postgres' | 'pglite';
  // postgres-only
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
  // pglite-only
  dataDir: string;
}

export interface AdminConfig {
  password: string;
}

export interface MetricsConfig {
  memoryBufferSize: number;
  flushIntervalMs: number;
  retentionDays: number;
}

export interface HealthConfig {
  checkIntervalMs: number;
  timeoutMs: number;
  failureThreshold: number;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  timeout: number;
  resetTimeout: number;
}

export interface SameProtocolPassthroughConfig {
  enabled: boolean;
  allowedProtocols: ('openai' | 'anthropic')[];
}

export interface LoggerConfig {
  level: 'trace' | 'debug' | 'info' | 'warn' | 'error';  // 日志级别
  enableRequestLog: boolean;                   // 是否启用请求日志
  enableDebug: boolean;                        // 是否启用 debug 日志
}

export interface GatewayConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  admin: AdminConfig;
  metrics: MetricsConfig;
  health: HealthConfig;
  circuitBreaker: CircuitBreakerConfig;
  sameProtocolPassthrough: SameProtocolPassthroughConfig;
  logger: LoggerConfig;
}
