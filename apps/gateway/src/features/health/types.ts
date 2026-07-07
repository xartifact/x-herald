/**
 * Health 相关类型定义
 */

export interface HealthStatus {
  status: 'ok' | 'error'
  timestamp: string
  database?: {
    status: 'connected' | 'disconnected'
  }
}
