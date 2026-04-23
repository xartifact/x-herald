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
 */
export async function executeWithRetry(params: RetryExecuteParams): Promise<RetryResult> {
  const { operation, timeout, requestId, isStreaming, config, onRetry } = params;
  const { maxRetries, baseDelay, maxDelay, retryableStatusCodes } = config;

  let retryCount = 0;
  let lastRetryableResponse: Response | undefined;

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
    } catch (fetchError) {
      cleanup();

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          response: null,
          retryCount,
          aborted: params.abortManager.isClientDisconnected ? 'client_disconnect' : 'timeout',
        };
      }
      throw fetchError;
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

    return { response: attemptResponse, retryCount, aborted: null };
  }

  // All attempts exhausted or client disconnected
  return {
    response: lastRetryableResponse ?? null,
    retryCount,
    aborted: params.abortManager.isClientDisconnected ? 'client_disconnect' : null,
  };
}
