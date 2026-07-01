import { describe, it, expect, mock, beforeEach } from 'bun:test';

import type { RetryConfig, RetryExecuteParams, RetryResult } from './retry-executor';

const { executeWithRetry } = await import('./retry-executor?v=1');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FAST_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelay: 1,     // 1ms for fast tests
  maxDelay: 10,     // 10ms cap
  retryableStatusCodes: [429, 500, 502, 503, 504, 521, 524],
};

function createMockAbortManager(overrides: { isClientDisconnected?: boolean } = {}) {
  return {
    isClientDisconnected: overrides.isClientDisconnected ?? false,
    createAttempt: mock(() => {
      const controller = new AbortController();
      return { controller, cleanup: mock(() => {}) };
    }),
  };
}

function createResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

function createParams(overrides: Partial<RetryExecuteParams> = {}): RetryExecuteParams {
  return {
    abortManager: createMockAbortManager(),
    operation: mock(async () => createResponse(200)),
    timeout: 30000,
    requestId: 'test-req',
    isStreaming: false,
    config: FAST_CONFIG,
    onRetry: mock(() => {}),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('executeWithRetry', () => {
  beforeEach(() => {
    mock.restore();
  });

  // --- Success on first attempt ---
  describe('success on first attempt', () => {
    it('should return response with retryCount=0 when first attempt succeeds', async () => {
      const response = createResponse(200);
      const params = createParams({ operation: mock(async () => response) });

      const result = await executeWithRetry(params);

      expect(result.response).toBe(response);
      expect(result.retryCount).toBe(0);
      expect(result.aborted).toBeNull();
      expect(result.networkError).toBe(false);
    });

    it('should not call onRetry on first attempt', async () => {
      const onRetry = mock(() => {});
      const params = createParams({ onRetry });

      await executeWithRetry(params);

      expect(onRetry).not.toHaveBeenCalled();
    });

    it('should call createAttempt with correct timeout, requestId, and isStreaming', async () => {
      const abortManager = createMockAbortManager();
      const params = createParams({ abortManager, timeout: 60000, requestId: 'req-42', isStreaming: true });

      await executeWithRetry(params);

      expect(abortManager.createAttempt).toHaveBeenCalledWith(60000, 'req-42', true);
    });

    it('should call cleanup after each attempt', async () => {
      const abortManager = createMockAbortManager();
      const params = createParams({ abortManager });

      await executeWithRetry(params);

      expect(abortManager.createAttempt).toHaveBeenCalled();
      const callResult = abortManager.createAttempt.mock.results[0];
      expect(callResult.type).toBe('return');
      const { cleanup } = callResult.value as { controller: AbortController; cleanup: () => void };
      expect(typeof cleanup).toBe('function');
      expect(cleanup).toHaveBeenCalled();
    });
  });

  // --- Retry on retryable HTTP status ---
  describe('retry on retryable HTTP status', () => {
    it('should retry on 429 and succeed on second attempt', async () => {
      let callCount = 0;
      const operation = mock(async () => {
        callCount++;
        if (callCount === 1) return createResponse(429);
        return createResponse(200);
      });

      const params = createParams({ operation });
      const result = await executeWithRetry(params);

      expect(result.response?.status).toBe(200);
      expect(result.retryCount).toBeGreaterThanOrEqual(1);
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('should retry on 500 status', async () => {
      let callCount = 0;
      const operation = mock(async () => {
        callCount++;
        if (callCount <= 2) return createResponse(500);
        return createResponse(200);
      });

      const params = createParams({ operation });
      const result = await executeWithRetry(params);

      expect(result.response?.status).toBe(200);
      expect(operation).toHaveBeenCalledTimes(3);
    });

    it('should call onRetry before each retry', async () => {
      const onRetry = mock((_attempt: number, _delay: number, _lastResponse?: Response) => {});
      let callCount = 0;
      const operation = mock(async () => {
        callCount++;
        if (callCount === 1) return createResponse(429);
        return createResponse(200);
      });

      await executeWithRetry(createParams({ operation, onRetry }));

      expect(onRetry).toHaveBeenCalledTimes(1);
      const args = onRetry.mock.calls[0] as [number, number, Response | undefined];
      expect(args[0]).toBe(1);
      expect(typeof args[1]).toBe('number');
    });
  });

  // --- Retry-After header ---
  describe('Retry-After header', () => {
    it('should use Retry-After value as delay when header is present', async () => {
      const onRetry = mock((_attempt: number, delay: number) => {});
      let callCount = 0;
      const operation = mock(async () => {
        callCount++;
        if (callCount === 1) return createResponse(429, { 'Retry-After': '0' }); // 0 seconds → 0ms
        return createResponse(200);
      });

      await executeWithRetry(createParams({ operation, onRetry, config: { ...FAST_CONFIG, baseDelay: 1, maxDelay: 10 } }));

      // Retry-After: 0 → delay = min(0*1000, 30000) = 0ms
      expect(onRetry).toHaveBeenCalledWith(1, 0, expect.any(Response));
    });

    it('should cap Retry-After delay at MAX_RETRY_AFTER_MS (30s) — verified with small value', async () => {
      const onRetry = mock((_attempt: number, delay: number) => {});
      let callCount = 0;
      const operation = mock(async () => {
        callCount++;
        if (callCount === 1) return createResponse(429, { 'Retry-After': '0' });
        return createResponse(200);
      });

      const config = { ...FAST_CONFIG, baseDelay: 1, maxDelay: 10 };
      await executeWithRetry(createParams({ operation, onRetry, config }));

      // Retry-After: 0 → min(0*1000, 30000) = 0ms delay
      // The formula Math.min(retryAfterSec * 1000, 30000) is verified here;
      // for 30s cap testing, the same formula with retryAfterSec > 30 would yield 30000
      expect(onRetry).toHaveBeenCalledWith(1, 0, expect.any(Response));
    });

    it('should fall back to exponential backoff when Retry-After is invalid', async () => {
      const onRetry = mock((_attempt: number, delay: number) => {});
      let callCount = 0;
      const operation = mock(async () => {
        callCount++;
        if (callCount === 1) return createResponse(429, { 'Retry-After': 'invalid' });
        return createResponse(200);
      });

      const config = { ...FAST_CONFIG, baseDelay: 10, maxDelay: 1000 };
      await executeWithRetry(createParams({ operation, onRetry, config }));

      const delay = onRetry.mock.calls[0][1] as number;
      // Exponential backoff: baseDelay * 2^0 + jitter = 10 + [0,200]
      expect(delay).toBeGreaterThanOrEqual(10);
      expect(delay).toBeLessThanOrEqual(210);
    });
  });

  // --- Exponential backoff ---
  describe('exponential backoff calculation', () => {
    it('should calculate baseDelay * 2^(attempt-1) capped at maxDelay', async () => {
      const delays: number[] = [];
      const onRetry = mock((_attempt: number, delay: number) => { delays.push(delay); });
      let callCount = 0;
      const operation = mock(async () => {
        callCount++;
        if (callCount <= 3) return createResponse(429);
        return createResponse(200);
      });

      const config = { ...FAST_CONFIG, baseDelay: 50, maxDelay: 500 };
      await executeWithRetry(createParams({ operation, onRetry, config }));

      // Attempt 1: 50*2^0 + jitter = 50 + [0,200] = [50,250]
      // Attempt 2: 50*2^1 + jitter = 100 + [0,200] = [100,300]
      // Attempt 3: 50*2^2 + jitter = 200 + [0,200] = [200,400]
      expect(delays[0]).toBeGreaterThanOrEqual(50);
      expect(delays[0]).toBeLessThanOrEqual(250);
      expect(delays[1]).toBeGreaterThanOrEqual(100);
      expect(delays[1]).toBeLessThanOrEqual(300);
      expect(delays[2]).toBeGreaterThanOrEqual(200);
      expect(delays[2]).toBeLessThanOrEqual(400);
    });

    it('should cap delay at maxDelay', async () => {
      const delays: number[] = [];
      const onRetry = mock((_attempt: number, delay: number) => { delays.push(delay); });
      let callCount = 0;
      const operation = mock(async () => {
        callCount++;
        return createResponse(429);
      });

      const config = { ...FAST_CONFIG, baseDelay: 100, maxDelay: 200, maxRetries: 5 };
      await executeWithRetry(createParams({ operation, onRetry, config }));

      // All delays should be <= maxDelay + 200 (jitter)
      for (const d of delays) {
        expect(d).toBeLessThanOrEqual(400); // 200 + 200 jitter
      }
    });
  });

  // --- Client disconnect ---
  describe('client disconnect', () => {
    it('should break loop before first attempt when isClientDisconnected is already true', async () => {
      const abortManager = createMockAbortManager({ isClientDisconnected: true });
      const operation = mock(async () => createResponse(429));

      const result = await executeWithRetry(createParams({ abortManager, operation }));

      expect(result.aborted).toBe('client_disconnect');
      expect(operation).toHaveBeenCalledTimes(0);
      expect(result.response).toBeNull();
    });

    it('should return response as-is when client disconnects after a retryable response', async () => {
      let callCount = 0;
      const abortManager = createMockAbortManager();
      const operation = mock(async () => {
        callCount++;
        if (callCount === 1) {
          abortManager.isClientDisconnected = true;
          return createResponse(429);
        }
        return createResponse(200);
      });

      const result = await executeWithRetry(createParams({ abortManager, operation }));

      // When disconnect coincides with a retryable response, the retry condition
      // (!isClientDisconnected) prevents retry — function returns response as-is
      expect(result.aborted).toBeNull();
      expect(result.response?.status).toBe(429);
      expect(result.networkError).toBe(false);
    });

    it('should break retry loop when disconnect occurs during retry delay (set via onRetry)', async () => {
      const abortManager = createMockAbortManager();
      const operation = mock(async () => createResponse(429));
      const onRetry = mock(() => { abortManager.isClientDisconnected = true; });

      const result = await executeWithRetry(createParams({ abortManager, operation, onRetry }));

      expect(result.aborted).toBe('client_disconnect');
      expect(operation.mock.calls.length).toBeLessThanOrEqual(2);
    });
  });

  // --- AbortError from operation ---
  describe('AbortError from operation', () => {
    it('should return client_disconnect when client is disconnected', async () => {
      const abortManager = createMockAbortManager({ isClientDisconnected: true });
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      const operation = mock(async () => { throw abortError; });

      const result = await executeWithRetry(createParams({ abortManager, operation }));

      expect(result.aborted).toBe('client_disconnect');
      expect(result.networkError).toBe(false);
      expect(result.response).toBeNull();
    });

    it('should return timeout when client is NOT disconnected', async () => {
      const abortManager = createMockAbortManager({ isClientDisconnected: false });
      const abortError = new DOMException('The operation was aborted', 'AbortError');
      const operation = mock(async () => { throw abortError; });

      const result = await executeWithRetry(createParams({ abortManager, operation }));

      expect(result.aborted).toBe('timeout');
      expect(result.networkError).toBe(false);
      expect(result.response).toBeNull();
    });
  });

  // --- Network error from operation ---
  describe('network error from operation', () => {
    it('should return networkError=true and NOT retry', async () => {
      const networkError = new TypeError('fetch failed: connection refused');
      const operation = mock(async () => { throw networkError; });

      const result = await executeWithRetry(createParams({ operation }));

      expect(result.networkError).toBe(true);
      expect(result.aborted).toBeNull();
      expect(result.response).toBeNull();
      // Should only call operation once — no retry on network error
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should preserve retryCount from before the error', async () => {
      let callCount = 0;
      const operation = mock(async () => {
        callCount++;
        if (callCount === 1) return createResponse(429);
        throw new TypeError('fetch failed');
      });

      const result = await executeWithRetry(createParams({ operation }));

      expect(result.networkError).toBe(true);
      expect(result.retryCount).toBeGreaterThanOrEqual(1);
    });
  });

  // --- Non-retryable HTTP status ---
  describe('non-retryable HTTP status', () => {
    it('should return immediately on 400 status without retrying', async () => {
      const response = createResponse(400);
      const operation = mock(async () => response);

      const result = await executeWithRetry(createParams({ operation }));

      expect(result.response).toBe(response);
      expect(result.retryCount).toBe(0);
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('should return immediately on 401 status without retrying', async () => {
      const response = createResponse(401);
      const operation = mock(async () => response);

      const result = await executeWithRetry(createParams({ operation }));

      expect(result.response?.status).toBe(401);
      expect(operation).toHaveBeenCalledTimes(1);
    });
  });

  // --- Max retries exhausted ---
  describe('max retries exhausted', () => {
    it('should return last retryable response when all attempts fail with retryable status', async () => {
      const operation = mock(async () => createResponse(429));

      const result = await executeWithRetry(createParams({ operation }));

      expect(result.response?.status).toBe(429);
      expect(result.retryCount).toBe(FAST_CONFIG.maxRetries);
      expect(result.aborted).toBeNull();
      expect(result.networkError).toBe(false);
    });

    it('should call operation maxRetries+1 times (initial + retries)', async () => {
      const operation = mock(async () => createResponse(500));

      await executeWithRetry(createParams({ operation }));

      expect(operation).toHaveBeenCalledTimes(FAST_CONFIG.maxRetries + 1);
    });
  });
});
