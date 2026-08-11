export interface SettingsResponse {
  success: boolean
  data?: Record<string, unknown>
  error?: string
}

export interface AvailableModelGroup {
  id: string
  name: string
  displayName: string
  instanceCount: number
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  openDurationMs: number
  maxBackoffMs?: number
  maxTripsBeforeCooldown?: number
  cooldownDurationMs?: number
}

/**
 * 全局 TTFB 超时配置（毫秒）。
 * - total*：请求级预算，耗尽后 504 且停止 failover
 * - attempt*：单次上游尝试基准超时（可被实例 override / baseline 抬高）
 */
export interface TtfbTimeoutConfig {
  totalStreamingMs: number
  totalNonStreamingMs: number
  attemptStreamingMs: number
  attemptNonStreamingMs: number
  minAttemptMs: number
  baselineMultiplier: number
}

export const DEFAULT_TTFB_TIMEOUT_CONFIG: TtfbTimeoutConfig = {
  totalStreamingMs: 90_000,
  totalNonStreamingMs: 60_000,
  attemptStreamingMs: 60_000,
  attemptNonStreamingMs: 30_000,
  minAttemptMs: 30_000,
  baselineMultiplier: 2,
}

export interface SettingsData {
  aiModelGroupId: string | null
  availableModelGroups: AvailableModelGroup[]
  circuitBreaker: CircuitBreakerConfig
  ttfbTimeout: TtfbTimeoutConfig
}

export interface SettingsFormData {
  aiModelGroupId?: string | null
  circuitBreaker?: CircuitBreakerConfig
  ttfbTimeout?: TtfbTimeoutConfig
}
