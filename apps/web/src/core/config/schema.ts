export interface ServerConfig {
  port: number;
  host: string;
  cors: {
    enabled: boolean;
    origins: string[];
  };
}

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl: boolean;
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

export interface GatewayConfig {
  server: ServerConfig;
  database: DatabaseConfig;
  admin: AdminConfig;
  metrics: MetricsConfig;
  health: HealthConfig;
  circuitBreaker: CircuitBreakerConfig;
}
