import { describe, it, expect, mock, beforeEach } from 'bun:test';
import type { Context } from 'hono';

import type { AbortManager } from './abort-manager';
import type { MarkLogFailedParams } from './failover-executor';
import type { FailoverExecutorParams } from './failover-executor';

const { executeFailoverIteration } = await import('./failover-executor?v=1');

// Mock executeWithRetry BEFORE importing failover-executor
mock.module('./retry-executor', () => ({
  executeWithRetry: mock(() => Promise.resolve({
    response: null,
    retryCount: 0,
    aborted: null,
    networkError: false,
  })),
}));

import { executeWithRetry } from './retry-executor';

const mockedExecuteWithRetry = executeWithRetry as unknown as {
  mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void;
  mock: { calls: unknown[][] };
};

function createParams(
  overrides: Partial<FailoverExecutorParams> = {},
): FailoverExecutorParams {
  const onRecordFailure = mock(() => {});
  const onRecordSuccess = mock(() => {});
  const onMarkLogAsFailed = mock(async () => {});
  const onLogEventBusEmitAborted = mock(() => {});
  const handleGatewayError = mock(
    async () => new Response('gateway error', { status: 504 }),
  );
  const handleProviderError = mock(
    async () => new Response('provider error', { status: 500 }),
  );
  const handleProviderErrorPassthrough = mock(
    async () => new Response('passthrough', { status: 500 }),
  );

  return {
    c: {} as unknown as Context,
    abortManager: {
      isClientDisconnected: false,
      createAttempt: mock(() => ({
        controller: new AbortController(),
        cleanup: mock(() => {}),
      })),
    } as unknown as AbortManager,
    onPrepareRequest: mock(async () => ({
      url: 'https://api.example.com/v1/chat',
      headers: {},
      body: '{}',
      isPassthroughEnabled: false,
    })),
    isStreaming: false,
    isLastCandidate: false,
    requestId: 'test-req-1',
    startTime: Date.now() - 1000,
    getLogId: mock(() => 'log-1'),
    getAttemptId: mock(() => 'attempt-1'),
    getPreprocessEndTime: mock(() => Date.now() - 500),
    clientIp: '127.0.0.1',
    userAgent: 'test-agent',
    requestPath: '/v1/chat/completions',
    requestMethod: 'POST',
    rawBody: { model: 'gpt-4' },
    retryConfig: {
      maxRetries: 2,
      baseDelay: 100,
      maxDelay: 1000,
      retryableStatusCodes: [429, 500],
    },
    onRecordFailure,
    onRecordSuccess,
    onMarkLogAsFailed,
    onLogEventBusEmitAborted,
    handleGatewayError,
    handleProviderError,
    handleProviderErrorPassthrough,
    ...overrides,
  };
}

function mockResponse(
  status: number,
  body: Record<string, unknown> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function mockRetryResult(result: {
  response: Response | null;
  retryCount: number;
  aborted: 'client_disconnect' | 'timeout' | null;
  networkError: boolean;
}) {
  mockedExecuteWithRetry.mockImplementation(() => Promise.resolve(result));
}

function getMockCalls(
  fn: unknown,
): unknown[][] {
  return (fn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}

function getMarkLogCalls(
  params: FailoverExecutorParams,
): MarkLogFailedParams[] {
  return getMockCalls(params.onMarkLogAsFailed).map(
    (call) => call[0] as MarkLogFailedParams,
  );
}

describe('executeFailoverIteration', () => {
  beforeEach(() => {
    mock.restore();
    const mockFn = executeWithRetry as unknown as { mockClear: () => void };
    mockFn.mockClear();
  });

  describe('abort paths', () => {
    it('returns abort when client disconnects', async () => {
      mockRetryResult({
        response: null,
        retryCount: 0,
        aborted: 'client_disconnect',
        networkError: false,
      });
      const params = createParams();
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('abort');
      expect(result.retryCount).toBe(0);
      expect(params.onLogEventBusEmitAborted).toHaveBeenCalledWith('log-1');
    });

    it('returns abort when retryResult has no response, no networkError, no aborted (ambiguous null)', async () => {
      mockRetryResult({
        response: null,
        retryCount: 2,
        aborted: null,
        networkError: false,
      });
      const params = createParams();
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('abort');
      expect(result.retryCount).toBe(2);
      expect(params.onLogEventBusEmitAborted).toHaveBeenCalledWith('log-1');
    });

    it('does not call onLogEventBusEmitAborted when logId is falsy', async () => {
      mockRetryResult({
        response: null,
        retryCount: 0,
        aborted: 'client_disconnect',
        networkError: false,
      });
      const params = createParams({ getLogId: () => undefined });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('abort');
      expect(params.onLogEventBusEmitAborted).not.toHaveBeenCalled();
    });

    it('returns retryCount from retryResult', async () => {
      mockRetryResult({
        response: null,
        retryCount: 3,
        aborted: null,
        networkError: false,
      });
      const params = createParams();
      const result = await executeFailoverIteration(params);
      expect(result.retryCount).toBe(3);
    });
  });

  describe('network/timeout error paths', () => {
    it('returns error with gateway timeout when over total budget (streaming)', async () => {
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: 'timeout',
        networkError: false,
      });
      const params = createParams({
        isStreaming: true,
        isLastCandidate: false,
        startTime: Date.now() - 100_000,
      });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(result.retryCount).toBe(1);
      expect(params.onRecordFailure).toHaveBeenCalled();
      expect(params.onMarkLogAsFailed).toHaveBeenCalled();
      expect(params.onLogEventBusEmitAborted).toHaveBeenCalledWith('log-1');
      expect(params.handleGatewayError).toHaveBeenCalled();
    });

    it('returns error with gateway timeout when over total budget (non-streaming)', async () => {
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: 'timeout',
        networkError: false,
      });
      const params = createParams({
        isStreaming: false,
        isLastCandidate: false,
        startTime: Date.now() - 70_000,
      });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(result.retryCount).toBe(1);
      expect(params.onRecordFailure).toHaveBeenCalled();
      expect(params.onMarkLogAsFailed).toHaveBeenCalled();
      expect(params.onLogEventBusEmitAborted).toHaveBeenCalledWith('log-1');
      expect(params.handleGatewayError).toHaveBeenCalled();
    });

    it('returns failover when not last candidate and not over total budget', async () => {
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: 'timeout',
        networkError: false,
      });
      const params = createParams({
        isLastCandidate: false,
        startTime: Date.now() - 1000,
      });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('failover');
      expect(result.retryCount).toBe(1);
      expect(params.onRecordFailure).toHaveBeenCalled();
      expect(params.onMarkLogAsFailed).toHaveBeenCalled();
      expect(params.onLogEventBusEmitAborted).toHaveBeenCalledWith('log-1');
      expect(params.handleGatewayError).not.toHaveBeenCalled();
    });

    it('returns error when last candidate and not over total budget', async () => {
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: 'timeout',
        networkError: false,
      });
      const params = createParams({
        isLastCandidate: true,
        startTime: Date.now() - 1000,
      });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(result.retryCount).toBe(1);
      expect(params.onRecordFailure).toHaveBeenCalled();
      expect(params.onMarkLogAsFailed).toHaveBeenCalled();
      expect(params.onLogEventBusEmitAborted).toHaveBeenCalledWith('log-1');
      expect(params.handleGatewayError).toHaveBeenCalled();
    });

    it('records failure and marks log as failed for network errors', async () => {
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: null,
        networkError: true,
      });
      const params = createParams({
        isLastCandidate: true,
        startTime: Date.now() - 1000,
      });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(params.onRecordFailure).toHaveBeenCalled();
      expect(params.onMarkLogAsFailed).toHaveBeenCalled();
    });

    it('records failure and marks log as failed for timeout errors', async () => {
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: 'timeout',
        networkError: false,
      });
      const params = createParams({
        isLastCandidate: true,
        startTime: Date.now() - 1000,
      });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(params.onRecordFailure).toHaveBeenCalled();
      expect(params.onMarkLogAsFailed).toHaveBeenCalled();
    });

    it('derives correct failoverReason: ttfb_timeout for timeout, network_error for network', async () => {
      // Timeout
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: 'timeout',
        networkError: false,
      });
      const paramsTimeout = createParams({
        isLastCandidate: true,
        startTime: Date.now() - 1000,
      });
      await executeFailoverIteration(paramsTimeout);
      const markLogTimeout = getMarkLogCalls(paramsTimeout)[0];
      expect(markLogTimeout.failoverReason).toBe('ttfb_timeout');

      // Network
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: null,
        networkError: true,
      });
      const paramsNetwork = createParams({
        isLastCandidate: true,
        startTime: Date.now() - 1000,
      });
      await executeFailoverIteration(paramsNetwork);
      const markLogNetwork = getMarkLogCalls(paramsNetwork)[0];
      expect(markLogNetwork.failoverReason).toBe('network_error');
    });

    it('calls handleGatewayError with correct error codes', async () => {
      // PATH B: over total (always 'ttfb_timeout')
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: 'timeout',
        networkError: false,
      });
      const paramsOverTotal = createParams({
        startTime: Date.now() - 100_000,
      });
      await executeFailoverIteration(paramsOverTotal);
      expect(paramsOverTotal.handleGatewayError).toHaveBeenCalledWith(
        'ttfb_timeout',
        expect.stringContaining('Provider response timeout'),
      );

      // PATH C: last candidate, timeout
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: 'timeout',
        networkError: false,
      });
      const paramsLastTimeout = createParams({
        isLastCandidate: true,
        startTime: Date.now() - 1000,
      });
      await executeFailoverIteration(paramsLastTimeout);
      expect(paramsLastTimeout.handleGatewayError).toHaveBeenCalledWith(
        'ttfb_timeout',
        expect.stringContaining('Provider response timeout'),
      );

      // PATH C: last candidate, network
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: null,
        networkError: true,
      });
      const paramsLastNetwork = createParams({
        isLastCandidate: true,
        startTime: Date.now() - 1000,
      });
      await executeFailoverIteration(paramsLastNetwork);
      expect(paramsLastNetwork.handleGatewayError).toHaveBeenCalledWith(
        'network_error',
        expect.stringContaining('Connection to provider failed'),
      );
    });
  });

  describe('success path', () => {
    it('returns success when response.ok is true', async () => {
      const response = mockResponse(200, { id: 'resp-1' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams();
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('success');
      expect(result.response).toBe(response);
      expect(result.retryCount).toBe(0);
    });

    it('calls onRecordSuccess on success', async () => {
      const response = mockResponse(200);
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams();
      await executeFailoverIteration(params);
      expect(params.onRecordSuccess).toHaveBeenCalled();
    });

    it('does not call onRecordFailure on success', async () => {
      const response = mockResponse(200);
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams();
      await executeFailoverIteration(params);
      expect(params.onRecordFailure).not.toHaveBeenCalled();
    });
  });

  describe('HTTP failover path', () => {
    it('returns failover for 429 status when not last candidate', async () => {
      const response = mockResponse(429, { error: 'rate limited' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: false });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('failover');
      expect(result.retryCount).toBe(0);
      expect(params.onRecordFailure).toHaveBeenCalled();
      expect(params.onMarkLogAsFailed).toHaveBeenCalled();
      expect(params.onLogEventBusEmitAborted).toHaveBeenCalledWith('log-1');
    });

    it('returns failover for 500 status when not last candidate', async () => {
      const response = mockResponse(500, { error: 'internal error' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: false });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('failover');
      expect(result.retryCount).toBe(0);
    });

    it('returns failover for 524 status when not last candidate', async () => {
      const response = mockResponse(524, { error: 'timeout' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: false });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('failover');
      expect(result.retryCount).toBe(0);
    });

    it('does not failover for 400 status (not in FAILOVER_STATUS_CODES)', async () => {
      const response = mockResponse(400, { error: 'bad request' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: false });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(result.response?.status).toBe(500);
      expect(params.onRecordFailure).not.toHaveBeenCalled();
      expect(params.handleProviderError).toHaveBeenCalledWith(
        response,
        params.rawBody,
      );
    });

    it('does not failover when isLastCandidate is true', async () => {
      const response = mockResponse(429, { error: 'rate limited' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: true });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(params.onRecordFailure).not.toHaveBeenCalled();
      expect(params.handleProviderError).toHaveBeenCalledWith(
        response,
        params.rawBody,
      );
    });

    it('derives http_429 failoverReason for 429', async () => {
      const response = mockResponse(429, { error: 'rate limited' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: false });
      await executeFailoverIteration(params);
      const markLogCall = getMarkLogCalls(params)[0];
      expect(markLogCall.failoverReason).toBe('http_429');
    });

    it('derives http_5xx failoverReason for 5xx', async () => {
      const response = mockResponse(500, { error: 'internal' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: false });
      await executeFailoverIteration(params);
      const markLogCall = getMarkLogCalls(params)[0];
      expect(markLogCall.failoverReason).toBe('http_5xx');
    });

    it('reads response body with 3s race timeout', async () => {
      const body = { error: 'rate limited', retry_after: 30 };
      const response = mockResponse(429, body);
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: false });
      await executeFailoverIteration(params);
      const markLogCall = getMarkLogCalls(params)[0];
      expect(markLogCall.providerResponseBody).toEqual(body);
    });
  });

  describe('provider error path', () => {
    it('returns error via handleProviderError when passthrough disabled', async () => {
      const response = mockResponse(400, { error: 'bad request' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({
        isLastCandidate: false,
        onPrepareRequest: async () => ({
          url: 'https://api.example.com/v1/chat',
          headers: {},
          body: '{}',
          isPassthroughEnabled: false,
        }),
      });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(params.handleProviderError).toHaveBeenCalledWith(
        response,
        params.rawBody,
      );
      expect(params.handleProviderErrorPassthrough).not.toHaveBeenCalled();
      expect(params.onLogEventBusEmitAborted).toHaveBeenCalledWith('log-1');
    });

    it('returns error via handleProviderErrorPassthrough when passthrough enabled', async () => {
      const response = mockResponse(400, { error: 'bad request' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({
        isLastCandidate: false,
        onPrepareRequest: async () => ({
          url: 'https://api.example.com/v1/chat',
          headers: {},
          body: '{}',
          isPassthroughEnabled: true,
        }),
      });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(params.handleProviderErrorPassthrough).toHaveBeenCalledWith(
        response,
        params.rawBody,
      );
      expect(params.handleProviderError).not.toHaveBeenCalled();
      expect(params.onLogEventBusEmitAborted).toHaveBeenCalledWith('log-1');
    });

    it('returns error when isLastCandidate is true even for failover-status codes', async () => {
      const response = mockResponse(429, { error: 'rate limited' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: true });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(params.handleProviderError).toHaveBeenCalledWith(
        response,
        params.rawBody,
      );
      expect(params.onRecordFailure).not.toHaveBeenCalled();
    });

    it('returns error for non-failover status codes even when not last candidate', async () => {
      const response = mockResponse(400, { error: 'bad request' });
      mockRetryResult({
        response,
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ isLastCandidate: false });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('error');
      expect(params.handleProviderError).toHaveBeenCalledWith(
        response,
        params.rawBody,
      );
      expect(params.onRecordFailure).not.toHaveBeenCalled();
    });
  });

  describe('integration', () => {
    it('calls onBeforeFetch before executing', async () => {
      const onBeforeFetch = mock(() => {});
      mockRetryResult({
        response: mockResponse(200),
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const params = createParams({ onBeforeFetch });
      await executeFailoverIteration(params);
      expect(onBeforeFetch).toHaveBeenCalled();
      expect(mockedExecuteWithRetry.mock.calls.length).toBe(1);
    });

    it('passes isStreaming to totalLimit calculation', async () => {
      // With streaming=true and startTime 75s ago, totalLimit=90s → not over total
      // Should return failover, not error
      mockRetryResult({
        response: null,
        retryCount: 1,
        aborted: 'timeout',
        networkError: false,
      });
      const params = createParams({
        isStreaming: true,
        isLastCandidate: false,
        startTime: Date.now() - 75_000,
      });
      const result = await executeFailoverIteration(params);
      expect(result.type).toBe('failover');
      expect(params.handleGatewayError).not.toHaveBeenCalled();
    });

    it('passes retryConfig to executeWithRetry', async () => {
      mockRetryResult({
        response: mockResponse(200),
        retryCount: 0,
        aborted: null,
        networkError: false,
      });
      const retryConfig = {
        maxRetries: 5,
        baseDelay: 200,
        maxDelay: 2000,
        retryableStatusCodes: [429, 500, 503],
      };
      const params = createParams({ retryConfig });
      await executeFailoverIteration(params);
      const executeWithRetryCall = mockedExecuteWithRetry.mock.calls[0][0] as {
        config: typeof retryConfig;
      };
      expect(executeWithRetryCall.config).toEqual(retryConfig);
    });
  });
});
