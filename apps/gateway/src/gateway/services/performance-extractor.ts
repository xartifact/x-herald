import type { LogMetadata } from '../../features/logs/db'

import type { MetadataExtractionParams } from './metadata-extractor'

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
