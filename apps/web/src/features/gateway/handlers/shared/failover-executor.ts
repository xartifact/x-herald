import type { Context } from 'hono';

import type { AbortManager } from './abort-manager';
import { CONNECT_TIMEOUT_MS, TTFB_TIMEOUT_MS_STREAMING, TTFB_TIMEOUT_MS_NON_STREAMING } from './constants';
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
    timeout: params.isStreaming ? TTFB_TIMEOUT_MS_STREAMING : TTFB_TIMEOUT_MS_NON_STREAMING,
    requestId: params.requestId,
    isStreaming: params.isStreaming,
    config: params.retryConfig,
    onRetry: params.onRetry,
  });

  if (retryResult.aborted || !retryResult.response) {
    if (params.isStreaming && params.logId) params.onLogEventBusEmitAborted(params.logId);
    return { type: 'abort', retryCount: retryResult.retryCount };
  }

  const response = retryResult.response;

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
