import { DEFAULTS } from '@xartifact/x-llm-gateway-shared'

import logger from '../../../lib/logger'
import { getTtfbTimeoutConfig } from '../../services/ttfb-timeout-policy'

export const CONNECT_TIMEOUT_MS = DEFAULTS.TTFB_TIMEOUT.CONNECT_TIMEOUT_MS

/** @deprecated 使用 getTtfbTimeoutConfig().totalStreamingMs */
export const TOTAL_TTFB_TIMEOUT_MS_STREAMING = DEFAULTS.TTFB_TIMEOUT.TOTAL_STREAMING_MS
/** @deprecated 使用 getTtfbTimeoutConfig().totalNonStreamingMs */
export const TOTAL_TTFB_TIMEOUT_MS_NON_STREAMING = DEFAULTS.TTFB_TIMEOUT.TOTAL_NON_STREAMING_MS
/** @deprecated 使用 getTtfbTimeoutConfig().minAttemptMs */
export const MIN_TTFB_TIMEOUT_MS = DEFAULTS.TTFB_TIMEOUT.MIN_ATTEMPT_MS

export interface CalculateTtfbTimeoutOptions {
  baselineTtfbP95?: number
  /** 单次 attempt 基准（全局 attempt* 或实例 override） */
  configuredTimeout: number
  /** 剩余全局预算（ms） */
  remainingBudget: number
  minAttemptMs?: number
  baselineMultiplier?: number
}

/**
 * 计算实例级 TTFB 超时：
 * attempt = min(max(baselineP95 × mult, minAttempt, configured), remainingBudget)
 */
export function calculateTtfbTimeout(options: CalculateTtfbTimeoutOptions): number
/** @deprecated 位置参数形式，保留兼容 */
export function calculateTtfbTimeout(
  baselineTtfbP95: number | undefined,
  configuredTimeout: number,
  totalLimit: number,
): number
export function calculateTtfbTimeout(
  baselineOrOpts: number | undefined | CalculateTtfbTimeoutOptions,
  configuredTimeout?: number,
  totalLimit?: number,
): number {
  const cfg = getTtfbTimeoutConfig()

  let baselineTtfbP95: number | undefined
  let configured: number
  let remainingBudget: number
  let minAttemptMs: number
  let baselineMultiplier: number

  if (baselineOrOpts != null && typeof baselineOrOpts === 'object') {
    baselineTtfbP95 = baselineOrOpts.baselineTtfbP95
    configured = baselineOrOpts.configuredTimeout
    remainingBudget = baselineOrOpts.remainingBudget
    minAttemptMs = baselineOrOpts.minAttemptMs ?? cfg.minAttemptMs
    baselineMultiplier = baselineOrOpts.baselineMultiplier ?? cfg.baselineMultiplier
  } else {
    baselineTtfbP95 = baselineOrOpts
    configured = configuredTimeout ?? 0
    remainingBudget = totalLimit ?? 0
    minAttemptMs = cfg.minAttemptMs
    baselineMultiplier = cfg.baselineMultiplier
  }

  const fromBaseline =
    baselineTtfbP95 != null && baselineTtfbP95 > 0 ? baselineTtfbP95 * baselineMultiplier : 0
  const uncapped = Math.max(fromBaseline, minAttemptMs, configured)
  const timeout = Math.min(uncapped, Math.max(0, remainingBudget))
  logger.debug(
    {
      baselineTtfbP95,
      configuredTimeout: configured,
      fromBaseline,
      uncapped,
      remainingBudget,
      minAttemptMs,
      baselineMultiplier,
      computed: timeout,
    },
    '[TTFB] Dynamic timeout calculated',
  )
  return timeout
}

export interface InstanceTimeoutConfigLike {
  connectTimeoutMs?: number
  ttfbTimeoutMs?: number
  connectTimeout?: number
  readTimeout?: number
}

/** 解析实例 connect 超时（兼容旧字段名） */
export function resolveConnectTimeoutMs(timeoutConfig?: InstanceTimeoutConfigLike | null): number {
  const v = timeoutConfig?.connectTimeoutMs ?? timeoutConfig?.connectTimeout
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v)
  return CONNECT_TIMEOUT_MS
}

/** 解析实例 attempt TTFB 覆盖（兼容旧 readTimeout） */
export function resolveInstanceAttemptTimeoutMs(
  timeoutConfig?: InstanceTimeoutConfigLike | null,
): number | undefined {
  const v = timeoutConfig?.ttfbTimeoutMs ?? timeoutConfig?.readTimeout
  if (typeof v === 'number' && Number.isFinite(v) && v > 0) return Math.round(v)
  return undefined
}
