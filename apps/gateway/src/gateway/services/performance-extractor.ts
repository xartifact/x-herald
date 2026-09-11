import type { LogMetadata } from '../../features/logs/db'

import type { MetadataExtractionParams } from './metadata-extractor'

function calcTokensPerSecond(params: MetadataExtractionParams): number | undefined {
  const {
    outputTokens,
    responseTimeMs,
    gatewayOverheadMs,
    providerTtfbMs,
    streamDurationMs,
    hasStreamedContent,
  } = params
  if (!outputTokens) return undefined
  // hasStreamedContent === false：本次没有任何 text/thinking delta 被增量下发（典型如一次性
  // 吐出的 tool_calls 参数），outputTokens 反映的是 TTFB 阶段的生成量，streamDurationMs 只是
  // 已生成好的 payload 传输耗时，两者不是同一阶段，强行相除没有意义，直接不采信
  if (hasStreamedContent === false) return undefined
  // 排除 TTFB，优先用 streamDurationMs，回退用总响应时间减去网关和 TTFB
  const genMs =
    streamDurationMs && streamDurationMs > 0
      ? streamDurationMs
      : responseTimeMs - (gatewayOverheadMs ?? 0) - (providerTtfbMs ?? 0)
  if (genMs <= 0) return undefined
  return Math.round((outputTokens / (genMs / 1000)) * 10) / 10
}

export function extractPerformanceMetrics(
  params: MetadataExtractionParams,
): LogMetadata['performance'] | null {
  const { responseTimeMs } = params
  let responseTimeTier: 'fast' | 'normal' | 'slow'
  if (responseTimeMs < 1000) responseTimeTier = 'fast'
  else if (responseTimeMs < 5000) responseTimeTier = 'normal'
  else responseTimeTier = 'slow'

  return {
    responseTimeTier,
    gatewayOverheadMs: params.gatewayOverheadMs,
    providerTtfbMs: params.providerTtfbMs,
    streamDurationMs: params.streamDurationMs,
    tokensPerSecond: calcTokensPerSecond(params),
  }
}

function categorizeError(errorType?: string, statusCode?: number): string {
  if (!errorType && !statusCode) return 'unknown'
  if (statusCode === 429) return 'rate_limit'
  if (statusCode === 401 || statusCode === 403) return 'authentication'
  if (statusCode === 400) return 'invalid_request'
  if (statusCode && statusCode >= 500) return 'server_error'
  if (errorType?.includes('timeout')) return 'timeout'
  if (errorType?.includes('network')) return 'network'
  if (errorType?.includes('rate')) return 'rate_limit'
  return 'unknown'
}

function isRecoverableError(errorType?: string, statusCode?: number): boolean {
  if (statusCode === 429 || statusCode === 503) return true
  if (errorType?.includes('timeout') || errorType?.includes('network')) return true
  if (statusCode === 401 || statusCode === 403 || statusCode === 400) return false
  return false
}

export function extractErrorInfo(params: MetadataExtractionParams): LogMetadata['error'] | null {
  if (!params.errorMessage && !params.errorType) return null
  return {
    category: categorizeError(params.errorType, params.statusCode),
    recoverable: isRecoverableError(params.errorType, params.statusCode),
  }
}

export function extractBusinessTags(
  params: MetadataExtractionParams,
): LogMetadata['business'] | null {
  const { userId, organizationId, tags } = params
  if (!userId && !organizationId && (!tags || tags.length === 0)) return null
  return { userId, organizationId, tags }
}
