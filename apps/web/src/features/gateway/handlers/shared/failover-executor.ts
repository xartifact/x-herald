import type { Context } from 'hono';

import type { AbortManager } from './abort-manager';
import { CONNECT_TIMEOUT_MS, calculateTtfbTimeout } from './constants';
import { executeWithRetry } from './retry-executor';
import { FAILOVER_STATUS_CODES } from '../../services/model-group-router';

export interface PreparedRequest {
  url: string;
  headers: Record<string, string>;
  body: string | null;
  isPassthroughEnabled?: boolean;
  targetProtocol?: 'openai' | 'anthropic';
}

export interface FailoverExecutorParams {
  c: Context;
  abortManager: AbortManager;
  onPrepareRequest: () => Promise<PreparedRequest>;
  isStreaming: boolean;
  isLastCandidate: boolean;
  requestId: string;
  startTime: number;
  logId?: string;
  preprocessEndTime: number;
  clientIp: string;
  userAgent: string;
  requestPath: string;
  requestMethod: string;
  rawBody: { model?: string; [key: string]: unknown };
  retryConfig: {
    maxRetries: number;
    baseDelay: number;
    maxDelay: number;
    retryableStatusCodes: number[];
  };
  /** Baseline TTFB P95 for this instance (ms). Used for dynamic timeout calculation. */
  baselineTtfbP95?: number;
  onBeforeFetch?: () => void;
  onRetry?: (attempt: number, delay: number, lastResponse?: Response) => void;
  onRecordFailure: () => void;
  onRecordSuccess: () => void;
  onMarkLogAsFailed: (logId: string, statusCode: number, errorMessage: string, retryCount: number, duration: number, body: unknown) => Promise<void>;
  onLogEventBusEmitAborted: (logId: string) => void;
  handleGatewayError: (errorCode: string, message: string) => Promise<Response>;
  handleProviderError: (response: Response, rawBody: unknown) => Promise<Response>;
  handleProviderErrorPassthrough: (response: Response, rawBody: unknown) => Promise<Response>;
}

export interface FailoverResult {
  type: 'abort' | 'error' | 'success' | 'failover';
  response?: Response;
  retryCount?: number;
}

export async function executeFailoverIteration(params: FailoverExecutorParams): Promise<FailoverResult> {
  const prepared = await params.onPrepareRequest();
  params.onBeforeFetch?.();

  const ttfbTimeout = calculateTtfbTimeout(
    params.baselineTtfbP95,
    params.isStreaming ? 60_000 : 30_000,
  );

  const retryResult = await executeWithRetry({
    abortManager: params.abortManager,
    operation: async (signal) => {
      return fetch(prepared.url, {
        method: 'POST',
        headers: prepared.headers,
        body: prepared.body,
        signal,
        connectTimeout: CONNECT_TIMEOUT_MS,
      } as RequestInit);
    },
    timeout: ttfbTimeout,
    requestId: params.requestId,
    isStreaming: params.isStreaming,
    config: params.retryConfig,
    onRetry: params.onRetry,
  });

  // Client disconnect → no point in failover or retry
  if (retryResult.aborted === 'client_disconnect' || (!retryResult.response && !retryResult.networkError && !retryResult.aborted)) {
    if (params.isStreaming && params.logId) params.onLogEventBusEmitAborted(params.logId);
    return { type: 'abort', retryCount: retryResult.retryCount };
  }

  // Network error OR TTFB timeout — trigger failover if possible
  if ((retryResult.networkError || retryResult.aborted === 'timeout') && !retryResult.response) {
    const totalWait = Date.now() - params.startTime;
    const totalLimit = params.isStreaming
      ? 90_000 // TOTAL_TTFB_TIMEOUT_MS_STREAMING
      : 60_000; // TOTAL_TTFB_TIMEOUT_MS_NON_STREAMING
    const overTotal = totalWait > totalLimit;

    // If over total limit, don't failover — return error
    if (overTotal) {
      if (params.isStreaming && params.logId) params.onLogEventBusEmitAborted(params.logId);
      params.onRecordFailure();
      const ttfbDuration = Date.now() - params.preprocessEndTime;
      await params.onMarkLogAsFailed(
        params.logId || '', 0, `TTFB timeout all candidates exceeded ${totalLimit / 1000}s total`, retryResult.retryCount, ttfbDuration, null,
      );
      return { type: 'error', response: await params.handleGatewayError('ttfb_timeout',
        `Provider response timeout: TTFB not received within configured time limit (${totalLimit / 1000}s total)`), retryCount: retryResult.retryCount };
    }

    const shouldFailover = !params.isLastCandidate;
    if (shouldFailover) {
      params.onRecordFailure();
      const ttfbDuration = Date.now() - params.preprocessEndTime;
      const reason = retryResult.aborted === 'timeout'
        ? `TTFB timeout after ${ttfbDuration}ms`
        : 'Network error: connection failed';
      await params.onMarkLogAsFailed(
        params.logId || '', 0, reason, retryResult.retryCount, ttfbDuration, null,
      );
      if (params.isStreaming && params.logId) params.onLogEventBusEmitAborted(params.logId);
      return { type: 'failover', retryCount: retryResult.retryCount };
    }
    // Last candidate — return gateway error
    if (params.isStreaming && params.logId) params.onLogEventBusEmitAborted(params.logId);
    params.onRecordFailure();
    const ttfbDuration = Date.now() - params.preprocessEndTime;
    await params.onMarkLogAsFailed(
      params.logId || '', 0, retryResult.aborted === 'timeout' ? `TTFB timeout after ${ttfbDuration}ms` : 'Network error: connection failed',
      retryResult.retryCount, ttfbDuration, null,
    );
    return { type: 'error', response: await params.handleGatewayError(
      retryResult.aborted === 'timeout' ? 'ttfb_timeout' : 'network_error',
      retryResult.aborted === 'timeout'
        ? `Provider response timeout: TTFB not received within configured time limit`
        : 'Connection to provider failed: TLS handshake or network error',
    ), retryCount: retryResult.retryCount };
  }

  const response = retryResult.response!;

  if (response.ok) {
    params.onRecordSuccess();
    return { type: 'success', response, retryCount: retryResult.retryCount };
  }

  // Response is not ok
  const shouldFailover = !params.isLastCandidate && FAILOVER_STATUS_CODES.has(response.status);
  if (shouldFailover) {
    params.onRecordFailure();
    const failoverRespBody = await response.json().catch(() => null);
    const ttfbDuration = Date.now() - params.preprocessEndTime;
    await params.onMarkLogAsFailed(params.logId || '', response.status, `Failover: HTTP ${response.status}`, retryResult.retryCount, ttfbDuration, failoverRespBody);
    if (params.isStreaming && params.logId) params.onLogEventBusEmitAborted(params.logId);
    return { type: 'failover', retryCount: retryResult.retryCount };
  }

  // Last candidate or non-failoverable status: return error
  if (params.isStreaming && params.logId) params.onLogEventBusEmitAborted(params.logId);
  const errorHandler = prepared.isPassthroughEnabled ? params.handleProviderErrorPassthrough : params.handleProviderError;
  return { type: 'error', response: await errorHandler(response, params.rawBody), retryCount: retryResult.retryCount };
}
