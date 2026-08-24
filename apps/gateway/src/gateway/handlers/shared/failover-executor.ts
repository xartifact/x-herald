import type { Context } from 'hono'

import type { FailoverReason } from '../../../features/logs/db'

import logger from '../../../lib/logger'
import { gatewayBusinessMetrics } from '../../../features/metrics/gateway-business-metrics'

import type { AbortManager } from './abort-manager'
import {
  calculateTtfbTimeout,
  resolveConnectTimeoutMs,
  resolveInstanceAttemptTimeoutMs,
  type InstanceTimeoutConfigLike,
} from './constants'
import { executeWithRetry } from './retry-executor'
import {
  FAILOVER_STATUS_CODES,
  ProviderInvalidResponseError,
} from '../../services/model-group-router'
import {
  getTtfbTimeoutConfig,
  refreshTtfbConfigIfStale,
  resolveAttemptBaseMs,
  resolveTotalLimitMs,
} from '../../services/ttfb-timeout-policy'

export interface PreparedRequest {
  url: string
  headers: Record<string, string>
  body: string | null
  isPassthroughEnabled?: boolean
  targetProtocol?: 'openai' | 'anthropic'
}

export interface MarkLogFailedParams {
  logId: string
  attemptId: string
  statusCode: number
  errorMessage: string
  failoverReason?: FailoverReason
  retryCount: number
  responseTimeMs: number
  providerResponseBody?: unknown
  providerTtfbMs?: number
}

export interface FailoverExecutorParams {
  c: Context
  abortManager: AbortManager
  onPrepareRequest: () => Promise<PreparedRequest>
  isStreaming: boolean
  isLastCandidate: boolean
  requestId: string
  providerName?: string
  instanceName?: string
  modelName?: string
  startTime: number
  getLogId: () => string | undefined
  getAttemptId: () => string | undefined
  getPreprocessEndTime: () => number
  clientIp: string
  userAgent: string
  requestPath: string
  requestMethod: string
  rawBody: { model?: string; [key: string]: unknown }
  retryConfig: {
    maxRetries: number
    baseDelay: number
    maxDelay: number
    retryableStatusCodes: number[]
  }
  baselineTtfbP95?: number
  /** 实例级 timeoutConfig（connect / ttfb override） */
  instanceTimeoutConfig?: InstanceTimeoutConfigLike | null
  onBeforeFetch?: () => void
  onRetry?: (attempt: number, delay: number, lastResponse?: Response) => void
  onRecordFailure: () => void | Promise<void>
  onRecordSuccess: () => void | Promise<void>
  onMarkLogAsFailed: (params: MarkLogFailedParams) => Promise<void>
  onLogEventBusEmitAborted: (logId: string) => void
  handleGatewayError: (errorOrCode: string | Error, fallbackMessage?: string) => Promise<Response>
  handleProviderError: (response: Response, rawBody: unknown) => Promise<Response>
  handleProviderErrorPassthrough: (response: Response, rawBody: unknown) => Promise<Response>
}

export interface FailoverResult {
  type: 'abort' | 'error' | 'success' | 'failover'
  response?: Response
  retryCount?: number
  /** abort 原因：客户端断开（TTFB 阶段）或等待超时竞态 */
  aborted?: 'client_disconnect' | 'timeout'
}

function deriveFailoverReason(statusCode: number): FailoverReason {
  if (statusCode === 429) return 'http_429'
  return 'http_5xx'
}

function isJsonContentType(ct: string | null): boolean {
  return !!ct && ct.toLowerCase().includes('application/json')
}

export async function executeFailoverIteration(
  params: FailoverExecutorParams,
): Promise<FailoverResult> {
  const prepared = await params.onPrepareRequest()
  const logId = params.getLogId()
  const attemptId = params.getAttemptId()
  const preprocessEndTime = params.getPreprocessEndTime()
  params.onBeforeFetch?.()

  // 多进程：TTL 内从 DB 刷新（与熔断器策略一致）
  await refreshTtfbConfigIfStale()

  const ttfbCfg = getTtfbTimeoutConfig()
  const totalLimit = resolveTotalLimitMs(params.isStreaming, ttfbCfg)
  const elapsed = Date.now() - params.startTime
  const remainingBudget = Math.max(0, totalLimit - elapsed)

  const globalAttempt = resolveAttemptBaseMs(params.isStreaming, ttfbCfg)
  const instanceAttempt = resolveInstanceAttemptTimeoutMs(params.instanceTimeoutConfig)
  const configuredTimeout = instanceAttempt ?? globalAttempt
  const connectTimeout = resolveConnectTimeoutMs(params.instanceTimeoutConfig)

  const ttfbTimeout = calculateTtfbTimeout({
    baselineTtfbP95: params.baselineTtfbP95,
    configuredTimeout,
    remainingBudget,
    minAttemptMs: ttfbCfg.minAttemptMs,
    baselineMultiplier: ttfbCfg.baselineMultiplier,
  })

  // 全局预算已耗尽：不再发上游请求，直接 504
  if (remainingBudget <= 0 || ttfbTimeout <= 0) {
    const ttfbDuration = Date.now() - preprocessEndTime
    if (logId) params.onLogEventBusEmitAborted(logId)
    await params.onRecordFailure()
    await params.onMarkLogAsFailed({
      logId: logId || '',
      attemptId: attemptId || '',
      statusCode: 0,
      errorMessage: `TTFB timeout all candidates exceeded ${totalLimit}ms total budget`,
      failoverReason: 'ttfb_timeout',
      retryCount: 0,
      responseTimeMs: ttfbDuration,
      providerTtfbMs: ttfbDuration,
    })
    return {
      type: 'error',
      response: await params.handleGatewayError(
        'ttfb_timeout',
        `Provider response timeout: TTFB not received within ${Math.round(totalLimit / 1000)}s total budget`,
      ),
      retryCount: 0,
    }
  }

  const retryResult = await executeWithRetry({
    abortManager: params.abortManager,
    operation: async (signal) => {
      return fetch(prepared.url, {
        method: 'POST',
        headers: prepared.headers,
        body: prepared.body,
        signal,
        connectTimeout,
      } as RequestInit)
    },
    timeout: ttfbTimeout,
    requestId: params.requestId,
    isStreaming: params.isStreaming,
    config: params.retryConfig,
    onRetry: params.onRetry,
  })

  if (
    retryResult.aborted === 'client_disconnect' ||
    (!retryResult.response && !retryResult.networkError && !retryResult.aborted)
  ) {
    if (logId) params.onLogEventBusEmitAborted(logId)
    return {
      type: 'abort',
      retryCount: retryResult.retryCount,
      aborted: retryResult.aborted ?? undefined,
    }
  }

  if ((retryResult.networkError || retryResult.aborted === 'timeout') && !retryResult.response) {
    const totalWait = Date.now() - params.startTime
    const overTotal = totalWait >= totalLimit
    const ttfbDuration = Date.now() - preprocessEndTime
    if (params.modelName && params.providerName) {
      gatewayBusinessMetrics.firstByteDuration.observe(
        {
          provider: params.providerName,
          model: params.modelName,
          stream: String(params.isStreaming),
        },
        ttfbDuration / 1000,
      )
    }
    const isTimeout = retryResult.aborted === 'timeout'
    const failoverReason: FailoverReason = isTimeout ? 'ttfb_timeout' : 'network_error'
    const errorMessage = isTimeout
      ? `TTFB timeout after ${ttfbDuration}ms (limit=${ttfbTimeout}ms)`
      : 'Network error: connection failed'

    if (overTotal) {
      if (logId) params.onLogEventBusEmitAborted(logId)
      await params.onRecordFailure()
      await params.onMarkLogAsFailed({
        logId: logId || '',
        attemptId: attemptId || '',
        statusCode: 0,
        errorMessage: `TTFB timeout all candidates exceeded ${totalLimit}ms total budget`,
        failoverReason,
        retryCount: retryResult.retryCount,
        responseTimeMs: ttfbDuration,
        providerTtfbMs: isTimeout ? ttfbDuration : undefined,
      })
      return {
        type: 'error',
        response: await params.handleGatewayError(
          'ttfb_timeout',
          `Provider response timeout: TTFB not received within ${Math.round(totalLimit / 1000)}s total budget`,
        ),
        retryCount: retryResult.retryCount,
      }
    }

    if (!params.isLastCandidate) {
      await params.onRecordFailure()
      await params.onMarkLogAsFailed({
        logId: logId || '',
        attemptId: attemptId || '',
        statusCode: 0,
        errorMessage,
        failoverReason,
        retryCount: retryResult.retryCount,
        responseTimeMs: ttfbDuration,
        providerTtfbMs: isTimeout ? ttfbDuration : undefined,
      })
      if (logId) params.onLogEventBusEmitAborted(logId)
      gatewayBusinessMetrics.failovers.inc({
        provider: params.providerName ?? 'unknown',
        instance: params.instanceName ?? 'unknown',
        reason: failoverReason,
      })
      return { type: 'failover', retryCount: retryResult.retryCount }
    }

    if (logId) params.onLogEventBusEmitAborted(logId)
    await params.onRecordFailure()
    await params.onMarkLogAsFailed({
      logId: logId || '',
      attemptId: attemptId || '',
      statusCode: 0,
      errorMessage,
      failoverReason,
      retryCount: retryResult.retryCount,
      responseTimeMs: ttfbDuration,
      providerTtfbMs: isTimeout ? ttfbDuration : undefined,
    })
    return {
      type: 'error',
      response: await params.handleGatewayError(
        isTimeout ? 'ttfb_timeout' : 'network_error',
        isTimeout
          ? `Provider response timeout: TTFB not received within ${Math.round(ttfbTimeout / 1000)}s`
          : 'Connection to provider failed: TLS handshake or network error',
      ),
      retryCount: retryResult.retryCount,
    }
  }

  const response = retryResult.response!

  if (response.ok) {
    // Skip the JSON check on streaming: SSE replies are intentionally non-JSON.
    if (!params.isStreaming && !isJsonContentType(response.headers.get('content-type'))) {
      const ttfbDurationEarly = Date.now() - preprocessEndTime
      logger.warn(
        {
          requestId: params.requestId ?? '',
          statusCode: response.status,
          contentType: response.headers.get('content-type'),
          ttfbMs: ttfbDurationEarly,
        },
        'Provider returned 2xx with non-JSON content-type, treating as upstream failure',
      )
      await response.body?.cancel()
      await params.onMarkLogAsFailed({
        logId: logId || '',
        attemptId: attemptId || '',
        statusCode: response.status,
        errorMessage: 'Upstream returned non-JSON body with 2xx status',
        failoverReason: 'invalid_response',
        retryCount: retryResult.retryCount,
        responseTimeMs: ttfbDurationEarly,
      })
      if (logId) params.onLogEventBusEmitAborted(logId)
      await params.onRecordFailure()
      if (params.isLastCandidate) {
        return {
          type: 'error',
          response: await params.handleGatewayError(
            new ProviderInvalidResponseError(
              params.providerName ?? 'unknown',
              response.status,
              'Provider returned a non-JSON response body with a 2xx status code',
            ),
          ),
          retryCount: retryResult.retryCount,
        }
      }
      gatewayBusinessMetrics.failovers.inc({
        provider: params.providerName ?? 'unknown',
        instance: params.instanceName ?? 'unknown',
        reason: 'invalid_response',
      })
      return { type: 'failover', retryCount: retryResult.retryCount }
    }
    await params.onRecordSuccess()
    return { type: 'success', response, retryCount: retryResult.retryCount }
  }

  const shouldFailover = !params.isLastCandidate && FAILOVER_STATUS_CODES.has(response.status)
  if (shouldFailover) {
    await params.onRecordFailure()
    const failoverRespBody = await Promise.race([
      response.json(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]).catch(() => null)
    const ttfbDuration = Date.now() - preprocessEndTime
    await params.onMarkLogAsFailed({
      logId: logId || '',
      attemptId: attemptId || '',
      statusCode: response.status,
      errorMessage: `Failover: HTTP ${response.status}`,
      failoverReason: deriveFailoverReason(response.status),
      retryCount: retryResult.retryCount,
      responseTimeMs: ttfbDuration,
      providerResponseBody: failoverRespBody,
    })
    if (logId) params.onLogEventBusEmitAborted(logId)
    gatewayBusinessMetrics.failovers.inc({
      provider: params.providerName ?? 'unknown',
      instance: params.instanceName ?? 'unknown',
      reason: deriveFailoverReason(response.status),
    })
    return { type: 'failover', retryCount: retryResult.retryCount }
  }

  if (logId) params.onLogEventBusEmitAborted(logId)
  const errorHandler = prepared.isPassthroughEnabled
    ? params.handleProviderErrorPassthrough
    : params.handleProviderError
  return {
    type: 'error',
    response: await errorHandler(response, params.rawBody),
    retryCount: retryResult.retryCount,
  }
}
