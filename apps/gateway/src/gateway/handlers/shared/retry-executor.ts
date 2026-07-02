import logger from '../../../lib/logger'

export interface RetryConfig {
  maxRetries: number
  baseDelay: number
  maxDelay: number
  retryableStatusCodes: number[]
}

export interface RetryExecuteParams {
  /** AbortManager (tracks client disconnect, creates attempt controllers) */
  abortManager: {
    isClientDisconnected: boolean
    createAttempt: (
      timeout: number,
      requestId: string,
      isStreaming: boolean,
    ) => {
      controller: AbortController
      cleanup: () => void
    }
  }
  /** fetch-like operation to execute with retry */
  operation: (signal: AbortSignal) => Promise<Response>
  /** TTFB timeout for each attempt */
  timeout: number
  requestId: string
  isStreaming: boolean
  config: RetryConfig
  /** Called before each retry attempt (for logging) */
  onRetry?: (attempt: number, delay: number, lastResponse?: Response) => void
}

export interface RetryResult {
  response: Response | null
  retryCount: number
  aborted: 'client_disconnect' | 'timeout' | null
  /** True when fetch itself threw a network error (TLS, DNS, connection refused, etc.) */
  networkError: boolean
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
 * - Network errors (TLS, DNS, connection refused, connect timeout): immediate exit → failover
 */
export async function executeWithRetry(params: RetryExecuteParams): Promise<RetryResult> {
  const { operation, timeout, requestId, isStreaming, config, onRetry } = params
  const { maxRetries, baseDelay, maxDelay, retryableStatusCodes } = config

  let retryCount = 0
  let lastRetryableResponse: Response | undefined

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // Retry delay: exponential backoff + jitter
    if (attempt > 0) {
      if (params.abortManager.isClientDisconnected) break

      const retryAfterHeader = lastRetryableResponse?.headers.get('Retry-After')
      const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : NaN
      const MAX_RETRY_AFTER_MS = 30_000
      const delay = !isNaN(retryAfterSec)
        ? Math.min(retryAfterSec * 1000, MAX_RETRY_AFTER_MS)
        : Math.min(baseDelay * Math.pow(2, attempt - 1), maxDelay) + Math.round(Math.random() * 200)

      onRetry?.(attempt, delay, lastRetryableResponse)
      await new Promise<void>((r) => setTimeout(r, delay))
      retryCount = attempt
    }

    if (params.abortManager.isClientDisconnected) break

    const { controller, cleanup } = params.abortManager.createAttempt(
      timeout,
      requestId,
      isStreaming,
    )

    let attemptResponse: Response
    try {
      attemptResponse = await operation(controller.signal)
    } catch (fetchError) {
      cleanup()

      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return {
          response: null,
          retryCount,
          aborted: params.abortManager.isClientDisconnected ? 'client_disconnect' : 'timeout',
          networkError: false,
        }
      }

      // Network error (TLS, DNS, connection refused, connect timeout, etc.)
      // Do NOT retry on the same instance — let failover-executor switch to the next candidate.
      // Retrying a broken/unreachable endpoint wastes the global TTFB budget.
      logger.warn(
        { requestId, error: fetchError instanceof Error ? fetchError.message : String(fetchError) },
        '[Network] Connection error, triggering failover',
      )
      return {
        response: null,
        retryCount,
        aborted: null,
        networkError: true,
      }
    }

    cleanup()

    // Check if retryable HTTP status
    if (
      !attemptResponse.ok &&
      retryableStatusCodes.includes(attemptResponse.status) &&
      attempt < maxRetries &&
      !params.abortManager.isClientDisconnected
    ) {
      lastRetryableResponse = attemptResponse
      continue
    }

    return { response: attemptResponse, retryCount, aborted: null, networkError: false }
  }

  // HTTP retries exhausted or client disconnected
  return {
    response: lastRetryableResponse ?? null,
    retryCount,
    aborted: params.abortManager.isClientDisconnected ? 'client_disconnect' : null,
    networkError: false,
  }
}
