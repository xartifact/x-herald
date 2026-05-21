import type { Context } from 'hono';

import type { FailoverReason } from '@x-llm-gateway/engine';

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

export interface MarkLogFailedParams {
  logId: string;
  attemptId: string;
  statusCode: number;
  errorMessage: string;
  failoverReason?: FailoverReason;
  retryCount: number;
  responseTimeMs: number;
  providerResponseBody?: unknown;
  providerTtfbMs?: number;
}

export interface FailoverExecutorParams {
  c: Context;
  abortManager: AbortManager;
  onPrepareRequest: () => Promise<PreparedRequest>;
  isStreaming: boolean;
  isLastCandidate: boolean;
  requestId: string;
  startTime: number;
  getLogId: () => string | undefined;
  getAttemptId: () => string | undefined;
  getPreprocessEndTime: () => number;
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
  baselineTtfbP95?: number;
  onBeforeFetch?: () => void;
  onRetry?: (attempt: number, delay: number, lastResponse?: Response) => void;
  onRecordFailure: () => void;
  onRecordSuccess: () => void;
  onMarkLogAsFailed: (params: MarkLogFailedParams) => Promise<void>;
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

function deriveFailoverReason(statusCode: number): FailoverReason {
  if (statusCode === 429) return 'http_429';
  return 'http_5xx';
}

export async function executeFailoverIteration(params: FailoverExecutorParams): Promise<FailoverResult> {
  const prepared = await params.onPrepareRequest();
  const logId = params.getLogId();
  const attemptId = params.getAttemptId();
  const preprocessEndTime = params.getPreprocessEndTime();
  params.onBeforeFetch?.();

  const totalLimit = params.isStreaming ? 90_000 : 60_000;
  const elapsed = Date.now() - params.startTime;
  const remainingBudget = Math.max(0, totalLimit - elapsed);
  const ttfbTimeout = calculateTtfbTimeout(
    params.baselineTtfbP95,
    params.isStreaming ? 60_000 : 30_000,
    remainingBudget,
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

  if (retryResult.aborted === 'client_disconnect' || (!retryResult.response && !retryResult.networkError && !retryResult.aborted)) {
    if (logId) params.onLogEventBusEmitAborted(logId);
    return { type: 'abort', retryCount: retryResult.retryCount };
  }

  if ((retryResult.networkError || retryResult.aborted === 'timeout') && !retryResult.response) {
    const totalWait = Date.now() - params.startTime;
    const overTotal = totalWait > totalLimit;
    const ttfbDuration = Date.now() - preprocessEndTime;
    const isTimeout = retryResult.aborted === 'timeout';
    const failoverReason: FailoverReason = isTimeout ? 'ttfb_timeout' : 'network_error';
    const errorMessage = isTimeout
      ? `TTFB timeout after ${ttfbDuration}ms`
      : 'Network error: connection failed';

    if (overTotal) {
      if (logId) params.onLogEventBusEmitAborted(logId);
      params.onRecordFailure();
      await params.onMarkLogAsFailed({ logId: logId || '', attemptId: attemptId || '', statusCode: 0, errorMessage: `TTFB timeout all candidates exceeded ${totalLimit / 1000}s total`, failoverReason, retryCount: retryResult.retryCount, responseTimeMs: ttfbDuration, providerTtfbMs: isTimeout ? ttfbDuration : undefined });
      return { type: 'error', response: await params.handleGatewayError('ttfb_timeout', `Provider response timeout: TTFB not received within configured time limit (${totalLimit / 1000}s total)`), retryCount: retryResult.retryCount };
    }

    if (!params.isLastCandidate) {
      params.onRecordFailure();
      await params.onMarkLogAsFailed({ logId: logId || '', attemptId: attemptId || '', statusCode: 0, errorMessage, failoverReason, retryCount: retryResult.retryCount, responseTimeMs: ttfbDuration, providerTtfbMs: isTimeout ? ttfbDuration : undefined });
      if (logId) params.onLogEventBusEmitAborted(logId);
      return { type: 'failover', retryCount: retryResult.retryCount };
    }

    if (logId) params.onLogEventBusEmitAborted(logId);
    params.onRecordFailure();
    await params.onMarkLogAsFailed({ logId: logId || '', attemptId: attemptId || '', statusCode: 0, errorMessage, failoverReason, retryCount: retryResult.retryCount, responseTimeMs: ttfbDuration, providerTtfbMs: isTimeout ? ttfbDuration : undefined });
    return { type: 'error', response: await params.handleGatewayError(isTimeout ? 'ttfb_timeout' : 'network_error', isTimeout ? 'Provider response timeout: TTFB not received within configured time limit' : 'Connection to provider failed: TLS handshake or network error'), retryCount: retryResult.retryCount };
  }

  const response = retryResult.response!;

  if (response.ok) {
    params.onRecordSuccess();
    return { type: 'success', response, retryCount: retryResult.retryCount };
  }

  const shouldFailover = !params.isLastCandidate && FAILOVER_STATUS_CODES.has(response.status);
  if (shouldFailover) {
    params.onRecordFailure();
    const failoverRespBody = await Promise.race([
      response.json(),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 3_000)),
    ]).catch(() => null);
    const ttfbDuration = Date.now() - preprocessEndTime;
    await params.onMarkLogAsFailed({ logId: logId || '', attemptId: attemptId || '', statusCode: response.status, errorMessage: `Failover: HTTP ${response.status}`, failoverReason: deriveFailoverReason(response.status), retryCount: retryResult.retryCount, responseTimeMs: ttfbDuration, providerResponseBody: failoverRespBody });
    if (logId) params.onLogEventBusEmitAborted(logId);
    return { type: 'failover', retryCount: retryResult.retryCount };
  }

  if (logId) params.onLogEventBusEmitAborted(logId);
  const errorHandler = prepared.isPassthroughEnabled ? params.handleProviderErrorPassthrough : params.handleProviderError;
  return { type: 'error', response: await errorHandler(response, params.rawBody), retryCount: retryResult.retryCount };
}
