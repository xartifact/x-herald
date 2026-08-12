import { DEFAULT_TTFB_TIMEOUT_CONFIG, type TtfbTimeoutConfig } from '@xartifact/x-herald-shared'

import { getConfig } from '../../features/gateway-config/service'
import logger from '../../lib/logger'

export const TTFB_TIMEOUT_CONFIG_KEY = 'TTFB_TIMEOUT_CONFIG'

export const DEFAULT_TTFB_CONFIG: TtfbTimeoutConfig = { ...DEFAULT_TTFB_TIMEOUT_CONFIG }

const MIN_MS = 5_000
const MAX_MS = 600_000
const CONFIG_CACHE_TTL = 30_000

export let runtimeConfig: TtfbTimeoutConfig = { ...DEFAULT_TTFB_CONFIG }
let configLoadedAt = 0

function isPositiveInt(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n > 0
}

/**
 * 校验并规范化 TTFB 配置。非法字段返回错误消息。
 */
export function validateTtfbTimeoutConfig(
  input: Partial<TtfbTimeoutConfig>,
): { ok: true; value: TtfbTimeoutConfig } | { ok: false; error: string } {
  const merged: TtfbTimeoutConfig = {
    ...DEFAULT_TTFB_CONFIG,
    ...input,
  }

  const fields: Array<keyof TtfbTimeoutConfig> = [
    'totalStreamingMs',
    'totalNonStreamingMs',
    'attemptStreamingMs',
    'attemptNonStreamingMs',
    'minAttemptMs',
  ]

  for (const key of fields) {
    const v = merged[key]
    if (!isPositiveInt(v) || v < MIN_MS || v > MAX_MS) {
      return { ok: false, error: `${key} 必须是 ${MIN_MS}-${MAX_MS} 之间的整数（毫秒）` }
    }
  }

  if (
    typeof merged.baselineMultiplier !== 'number' ||
    !Number.isFinite(merged.baselineMultiplier) ||
    merged.baselineMultiplier < 1 ||
    merged.baselineMultiplier > 10
  ) {
    return { ok: false, error: 'baselineMultiplier 必须是 1-10 之间的数字' }
  }

  if (merged.attemptStreamingMs > merged.totalStreamingMs) {
    return { ok: false, error: 'attemptStreamingMs 不能大于 totalStreamingMs' }
  }
  if (merged.attemptNonStreamingMs > merged.totalNonStreamingMs) {
    return { ok: false, error: 'attemptNonStreamingMs 不能大于 totalNonStreamingMs' }
  }
  if (merged.minAttemptMs > merged.attemptStreamingMs) {
    return { ok: false, error: 'minAttemptMs 不能大于 attemptStreamingMs' }
  }
  if (merged.minAttemptMs > merged.attemptNonStreamingMs) {
    return { ok: false, error: 'minAttemptMs 不能大于 attemptNonStreamingMs' }
  }

  return { ok: true, value: merged }
}

export function configureTtfbTimeout(
  settings: TtfbTimeoutConfig,
  now: () => number = () => Date.now(),
): void {
  runtimeConfig = { ...settings }
  configLoadedAt = now()
  logger.info({ settings }, '[TTFB] Config updated')
}

export function getTtfbTimeoutConfig(): TtfbTimeoutConfig {
  return runtimeConfig
}

export async function refreshTtfbConfigIfStale(
  now: () => number = () => Date.now(),
): Promise<void> {
  const nowMs = now()
  if (nowMs - configLoadedAt < CONFIG_CACHE_TTL) return
  configLoadedAt = nowMs

  try {
    const stored = await getConfig<TtfbTimeoutConfig | null>(TTFB_TIMEOUT_CONFIG_KEY, null)
    if (stored) {
      const validated = validateTtfbTimeoutConfig(stored)
      if (validated.ok) {
        runtimeConfig = validated.value
      } else {
        logger.warn(
          { error: validated.error, stored },
          '[TTFB] Invalid stored config, using defaults',
        )
        runtimeConfig = { ...DEFAULT_TTFB_CONFIG }
      }
    }
  } catch (err) {
    // DB 未就绪或瞬时故障时保留当前 runtimeConfig（默认 / 上次成功值）
    logger.warn({ err }, '[TTFB] Failed to refresh config from DB, keeping runtime value')
  }
}

/** 启动 / 导入后强制从 DB 加载 */
export async function loadTtfbTimeoutConfig(): Promise<void> {
  configLoadedAt = 0
  await refreshTtfbConfigIfStale()
}

export function resolveTotalLimitMs(
  isStreaming: boolean,
  cfg: TtfbTimeoutConfig = runtimeConfig,
): number {
  return isStreaming ? cfg.totalStreamingMs : cfg.totalNonStreamingMs
}

export function resolveAttemptBaseMs(
  isStreaming: boolean,
  cfg: TtfbTimeoutConfig = runtimeConfig,
): number {
  return isStreaming ? cfg.attemptStreamingMs : cfg.attemptNonStreamingMs
}
