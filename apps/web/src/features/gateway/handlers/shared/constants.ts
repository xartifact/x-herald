export const CONNECT_TIMEOUT_MS = 30_000;
export const TTFB_TIMEOUT_MS_STREAMING = 600_000;
export const TTFB_TIMEOUT_MS_NON_STREAMING = 300_000;

/**
 * 请求级全局超时：所有候选实例累计等待 TTFB 的最大时间
 * 超过此时间直接返回 504，不再尝试后续候选
 */
export const TOTAL_TTFB_TIMEOUT_MS_STREAMING = 90_000;
export const TOTAL_TTFB_TIMEOUT_MS_NON_STREAMING = 60_000;
