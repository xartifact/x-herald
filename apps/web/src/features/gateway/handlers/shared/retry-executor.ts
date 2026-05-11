import logger from '@/core/lib/logger';

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  retryableStatusCodes: number[];
}

export interface RetryExecuteParams {
  /** AbortManager (tracks client disconnect, creates attempt controllers) */
  abortManager: {
    isClientDisconnected: boolean;
    createAttempt: (timeout: number, requestId: string, isStreaming: boolean) => {
      controller: AbortController;
      cleanup: () => void;
    };
  };
  /** fetch-like operation to execute with retry */
  operation: (signal: AbortSignal) => Promise<Response>;
  /** TTFB timeout for each attempt */
  timeout: number;
  requestId: string;
  isStreaming: boolean;
  config: RetryConfig;
  /** Called before each retry attempt (for logging) */
  onRetry?: (attempt: number, delay: number, lastResponse?: Response) => void;
}

export interface RetryResult {
  response: Response | null;
  retryCount: number;
  aborted: 'client_disconnect' | 'timeout' | null;
  /** True when fetch itself threw a network error (TLS, DNS, connection refused, etc.) */
  networkError: boolean;
}

/**
 * 判断错误是否为可重试的网络错误
 * TLS 握手失败、连接拒绝、DNS 解析失败等瞬时网络问题应当重试
 */
function isRetryableNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const msg = error.message.toLowerCase();
  const causeMsg = error.cause instanceof Error ? error.cause.message.toLowerCase() : '';

  // TLS 握手失败
  if (msg.includes('tls') || causeMsg.includes('tls')) return true;
  if (msg.includes('ssl') || causeMsg.includes('ssl')) return true;
  if (msg.includes('secure connection') || causeMsg.includes('secure connection')) return true;

  // 连接拒绝 / 网络不可达
  if (msg.includes('econnrefused') || causeMsg.includes('econnrefused')) return true;
  if (msg.includes('econnreset') || causeMsg.includes('econnreset')) return true;
  if (msg.includes('enotfound') || causeMsg.includes('enotfound')) return true;
  if (msg.includes('enetunreach') || causeMsg.includes('enetunreach')) return true;
  if (msg.includes('ehostunreach') || causeMsg.includes('ehostunreach')) return true;
  if (msg.includes('econnaborted') || causeMsg.includes('econnaborted')) return true;

  // 通用 fetch 失败（Bun/Node 网络层错误）
  if (msg.includes('fetch failed') || causeMsg.includes('fetch failed')) return true;
  if (msg.includes('socket disconnected') || causeMsg.includes('socket disconnected')) return true;
  if (msg.includes('connect timeout') || causeMsg.includes('connect timeout')) return true;

  // 连接超时
  if (msg.includes('connection timed out') || causeMsg.includes('connection timed out')) return true;
  if (msg.includes('connection refused') || causeMsg.includes('connection refused')) return true;

  return false;
}

/**
 * Generic retry executor with exponential backoff + jitter.
 *
 * Wraps a fetch-like operation with configurable retry logic:
 * - Exponential backoff: baseDelay * 2^(attempt-1), capped at maxDelay
 * - Jitter: random 0-200ms added to each backoff
 * - Retry-After header: honored when present on retryable responses
 * - Client disconnect: breaks retry loop immediately
 * - AbortError: distinguished between timeout and client disconnect
 * - Network errors (TLS, DNS, connection refused): retried like retryable status codes
 */
export async function executeWithRetry(params: RetryExecuteParams): Promise<RetryResult> {
  const { operation, timeout, requestId, isStreaming, config, onRetry } = params;
  const { maxRetries, baseDelay, maxDelay, retryableStatusCodes } = config;

  let retryCount = 0;
  let lastRetryableResponse: Response | undefined;
  let lastNetworkError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Retry delay: exponential backoff + jitter
    if (attempt > 0) {
      if (params.abortManager.isClientDisconnected) break;

      const retryAfterHeader = lastRetryableResponse?.headers.get('Retry-After');
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN;
      const delay = !isNaN(retryAfterSec)
        ? retryAfterSec * 1000
        : Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay) + Math.round(Math.random() * 200);

      onRetry?.(attempt, delay, lastRetryableResponse);
      await new Promise<void>((r) => setTimeout(r, delay));
      retryCount = attempt;
    }

    if (params.abortManager.isClientDisconnected) break;

    const { controller, cleanup } = params.abortManager.createAttempt(timeout, requestId, isStreaming);

    let attemptResponse: Response;
    try {
      attemptResponse = await operation(controller.signal);
      lastNetworkError = undefined; // Clear on successful fetch
    } catch (fetchError) {
      cleanup();

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          response: null,
          retryCount,
          aborted: params.abortManager.isClientDisconnected ? 'client_disconnect' : 'timeout',
          networkError: false,
        };
      }

      // Network error (TLS, DNS, connection refused, etc.) — retry if possible
      lastNetworkError = fetchError instanceof Error ? fetchError : new Error(String(fetchError));
      if (isRetryableNetworkError(fetchError) && attempt < maxRetries && !params.abortManager.isClientDisconnected) {
        logger.debug(
          { requestId, attempt: attempt + 1, maxRetries, error: lastNetworkError.message },
          '[Retry] Network error, retrying',
        );
        continue;
      }

      // Exhausted retries or non-retryable error — propagate as networkError
      return {
        response: null,
        retryCount,
        aborted: null,
        networkError: true,
      };
    }

    cleanup();

    // Check if retryable
    if (
      !attemptResponse.ok &&
      retryableStatusCodes.includes(attemptResponse.status) &&
      attempt < maxRetries &&
      !params.abortManager.isClientDisconnected
    ) {
      lastRetryableResponse = attemptResponse;
      continue;
    }

    return { response: attemptResponse, retryCount, aborted: null, networkError: false };
  }

  // All attempts exhausted or client disconnected
  if (lastNetworkError) {
    return {
      response: null,
      retryCount,
      aborted: params.abortManager.isClientDisconnected ? 'client_disconnect' : null,
      networkError: true,
    };
  }
  return {
    response: lastRetryableResponse ?? null,
    retryCount,
    aborted: params.abortManager.isClientDisconnected ? 'client_disconnect' : null,
    networkError: false,
  };
}
