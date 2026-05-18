import logger from '@/core/lib/logger';

export const CONNECT_TIMEOUT_MS = 30_000;
export const TTFB_TIMEOUT_MS_STREAMING = 600_000;
export const TTFB_TIMEOUT_MS_NON_STREAMING = 300_000;

/**
 * 请求级全局超时：所有候选实例累计等待 TTFB 的最大时间
 * 超过此时间直接返回 504，不再尝试后续候选
 */
export const TOTAL_TTFB_TIMEOUT_MS_STREAMING = 90_000;
export const TOTAL_TTFB_TIMEOUT_MS_NON_STREAMING = 60_000;

/**
 * TTFB 超时最小值（无基线时的兜底）
 */
export const MIN_TTFB_TIMEOUT_MS = 30_000;

/**
 * 计算实例级 TTFB 超时：
 * ttfbTimeout = min(max(baselineP95 × 2, MIN_TTFB_TIMEOUT, configuredTimeout), totalLimit)
 *
 * 单次尝试超时不得超过全局 total limit，否则全局保护无法生效。
 */
export function calculateTtfbTimeout(
  baselineTtfbP95: number | undefined,
  configuredTimeout: number,
  totalLimit: number,
): number {
  const fromBaseline = baselineTtfbP95 != null && baselineTtfbP95 > 0
    ? baselineTtfbP95 * 2
    : 0;
  const uncapped = Math.max(fromBaseline, MIN_TTFB_TIMEOUT_MS, configuredTimeout);
  const timeout = Math.min(uncapped, totalLimit);
  logger.debug(
    { baselineTtfbP95, configuredTimeout, fromBaseline, uncapped, totalLimit, computed: timeout },
    '[TTFB] Dynamic timeout calculated',
  );
  return timeout;
}
