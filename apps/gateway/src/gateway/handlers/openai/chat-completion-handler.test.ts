import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';
import type { Context } from 'hono';

const realConfig = await import('../../../config');
const realLogger = await import('../../../lib/logger');
const realAccessModelRouter = await import('../../services/access-model-router');
const realClientIdentifier = await import('../../services/client-identifier');
const realErrorHandler = await import('../../services/error-handler');
const realModelGroupRouter = await import('../../services/model-group-router');
const realProtocolDetector = await import('../../services/protocol-detector');
const realResponseHandlers = await import('../../services/response-handlers');
const realTransformer = await import('../../transformer');
const realFailoverExecutor = await import('../shared/failover-executor');
const realChatCompletionExecutor = await import('./chat-completion-executor');

const mockLogger = {
  info: mock(() => {}),
  debug: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  child: mock(() => mockLogger),
};

mock.module('../../../config', () => ({
  loadConfig: mock(() => ({
    sameProtocolPassthrough: { enabled: true, allowedProtocols: ['openai'] },
  })),
}));

mock.module('../../../lib/logger', () => ({
  default: mockLogger,
}));

const mockRouteCandidates = mock(async () => []);

mock.module('../../services/access-model-router', () => ({
  accessModelRouter: {
    routeCandidates: mockRouteCandidates,
  },
}));

mock.module('../../services/client-identifier', () => ({
  identifyClient: mock(() => ({ type: 'unknown', name: 'unknown' })),
}));

const mockHandleGatewayError = mock(async () => new Response('gateway error', { status: 500 }));
const mockHandleProviderError = mock(async () => new Response('provider error', { status: 500 }));
const mockHandleProviderErrorPassthrough = mock(async () => new Response('passthrough', { status: 500 }));

mock.module('../../services/error-handler', () => ({
  handleGatewayError: mockHandleGatewayError,
  handleProviderError: mockHandleProviderError,
  handleProviderErrorPassthrough: mockHandleProviderErrorPassthrough,
}));

mock.module('../../services/model-group-router', () => ({
  ModelNotFoundError: class ModelNotFoundError extends Error {
    constructor(model: string) {
      super(`Model not found: ${model}`);
      this.name = 'ModelNotFoundError';
    }
  },
  FAILOVER_STATUS_CODES: new Set([429, 500, 502, 503, 504, 521, 524]),
}));

const mockGetProviderProtocol = mock(() => 'openai');
const mockGetProviderUrl = mock(() => 'https://api.openai.com');

mock.module('../../services/protocol-detector', () => ({
  getProviderProtocol: mockGetProviderProtocol,
  getProviderUrl: mockGetProviderUrl,
}));

const mockHandleStreamingResponse = mock(() => new Response('stream', { status: 200 }));
const mockHandleNonStreamingResponse = mock(() => new Response('non-stream', { status: 200 }));

mock.module('../../services/response-handlers', () => ({
  handleStreamingResponse: mockHandleStreamingResponse,
  handleNonStreamingResponse: mockHandleNonStreamingResponse,
}));

const mockNormalizeRequest = mock(async (body: unknown, _ctx: unknown) => ({
  model: (body as Record<string, unknown>).model || 'gpt-4',
  messages: [{ role: 'user', content: 'hello' }],
  stream: false,
  ...(body as Record<string, unknown>),
}));

mock.module('../../transformer', () => ({
  getTransformer: mock((protocol: string) => {
    if (protocol === 'openai') {
      return {
        normalizeRequest: mockNormalizeRequest,
        adaptRequest: mock(async () => ({
          body: { model: 'gpt-4-turbo' },
          headers: { 'content-type': 'application/json' },
          url: 'https://api.openai.com/v1/chat/completions',
        })),
      };
    }
    return undefined;
  }),
  createTransformerContext: mock((requestId: string) => ({
    requestId,
    startTime: Date.now(),
    state: new Map(),
    request: { model: '', messages: [] },
    provider: { name: '', baseUrl: '', apiKey: '', protocol: 'openai', models: [] },
    model: '',
    headers: {},
    metadata: {},
  })),
}));

const mockExecuteFailoverIteration = mock(async () => ({
  type: 'success' as const,
  response: new Response('{"id":"test"}', { status: 200, headers: { 'content-type': 'application/json' } }),
  retryCount: 0,
}));

mock.module('../shared/failover-executor', () => ({
  executeFailoverIteration: mockExecuteFailoverIteration,
}));

mock.module('./chat-completion-executor', () => ({
  ChatCompletionCandidateExecutor: class MockChatCompletionCandidateExecutor {
    logId: string | undefined;
    attemptId: string | undefined;
    transformedBody: unknown;
    providerRequestHeaders: Record<string, string> | undefined;
    preprocessEndTime = Date.now();

    constructor(_config: unknown) {}

    async prepareRequest() {
      return { url: 'https://api.openai.com/v1/chat/completions', headers: {}, body: '{}', isPassthroughEnabled: true, targetProtocol: 'openai' };
    }

    beforeFetch() {}
    retry() {}
    recordFailure() {}
    recordSuccess() {}
    async markLogFailed() {}
    emitAbortedEvent() {}
    async gatewayError() { return new Response('gateway error', { status: 500 }); }
    async providerError() { return new Response('provider error', { status: 500 }); }
    async providerErrorPassthrough() { return new Response('passthrough', { status: 500 }); }
  },
}));

import { handleOpenAIChatCompletion } from './chat-completion-handler';
import { accessModelRouter } from '../../services/access-model-router';
import { getProviderUrl } from '../../services/protocol-detector';
import { getTransformer } from '../../transformer';
import { executeFailoverIteration } from '../shared/failover-executor';
import { handleGatewayError } from '../../services/error-handler';
import { createTestVirtualKey, createTestProvider, createTestModelGroup, createTestModelInstance } from '../../../test/factories';

function createMockContext(overrides: Record<string, unknown> = {}) {
  const body = overrides.body as Record<string, unknown> ?? { model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }] };
  const headers = new Headers((overrides.headers as Record<string, string>) ?? { 'content-type': 'application/json' });

  const variables = new Map<string, unknown>([
    ['virtualKey', overrides.virtualKey ?? createTestVirtualKey()],
    ['requestId', overrides.requestId ?? 'test-req-1'],
  ]);

  const c = {
    req: {
      path: '/v1/chat/completions',
      method: 'POST',
      header: (name: string) => headers.get(name) || undefined,
      raw: {
        headers,
        signal: new AbortController().signal,
      },
      json: async () => body,
    },
    get: (key: string) => variables.get(key),
    json: (body: unknown, status?: number) => new Response(JSON.stringify(body), { status: status ?? 200, headers: { 'content-type': 'application/json' } }),
  } as unknown as Context;

  return c;
}

function createMockRouteResult(overrides = {}) {
  return {
    instance: createTestModelInstance(),
    provider: createTestProvider(),
    group: createTestModelGroup(),
    decision: { strategy: 'priority' },
    mapping: {
      modelName: 'gpt-4',
      isMapped: true,
      originalModel: 'gpt-4',
      mappingType: 'virtual',
    },
    matchedRule: { id: 'rule-1', name: 'Test Rule', priority: 1 },
    perf: undefined,
    ...overrides,
  };
}

function getMockCalls(fn: unknown): unknown[][] {
  return (fn as unknown as { mock: { calls: unknown[][] } }).mock.calls;
}

describe('handleOpenAIChatCompletion', () => {
  beforeEach(() => {
    mock.restore();

    const mockRouteCandidates = accessModelRouter.routeCandidates as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockRouteCandidates.mockImplementation(async () => [createMockRouteResult()]);

    const mockGetProviderUrl = getProviderUrl as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void };
    mockGetProviderUrl.mockImplementation(() => 'https://api.openai.com');

    const mockGetTransformer = getTransformer as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void };
    mockGetTransformer.mockImplementation((protocol: string) => {
      if (protocol === 'openai') {
        return {
          normalizeRequest: mockNormalizeRequest,
          adaptRequest: mock(async () => ({
            body: { model: 'gpt-4-turbo' },
            headers: { 'content-type': 'application/json' },
            url: 'https://api.openai.com/v1/chat/completions',
          })),
        };
      }
      return undefined;
    });

    const mockExecuteFailover = executeFailoverIteration as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockExecuteFailover.mockImplementation(async () => ({
      type: 'success',
      response: new Response('{"id":"test"}', { status: 200, headers: { 'content-type': 'application/json' } }),
      retryCount: 0,
    }));

    const allMocks = [
      mockLogger.info, mockLogger.debug, mockLogger.warn, mockLogger.error,
      mockHandleGatewayError, mockHandleStreamingResponse, mockHandleNonStreamingResponse,
      mockRouteCandidates, mockExecuteFailover,
    ];
    for (const m of allMocks) {
      const fn = m as unknown as { mockClear: () => void };
      fn.mockClear();
    }
  });

  afterAll(async () => {
    const realConfig = await import('../../../config');
    const realLogger = await import('../../../lib/logger');
    const realAccessModelRouter = await import('../../services/access-model-router');
    const realClientIdentifier = await import('../../services/client-identifier');
    const realErrorHandler = await import('../../services/error-handler');
    const realModelGroupRouter = await import('../../services/model-group-router');
    const realProtocolDetector = await import('../../services/protocol-detector');
    const realResponseHandlers = await import('../../services/response-handlers');
    const realTransformer = await import('../../transformer');
    const realFailoverExecutor = await import('../shared/failover-executor');
    const realChatCompletionExecutor = await import('./chat-completion-executor');
    mock.module('../../../config', () => realConfig);
    mock.module('../../../lib/logger', () => realLogger);
    mock.module('../../services/access-model-router', () => realAccessModelRouter);
    mock.module('../../services/client-identifier', () => realClientIdentifier);
    mock.module('../../services/error-handler', () => realErrorHandler);
    mock.module('../../services/model-group-router', () => realModelGroupRouter);
    mock.module('../../services/protocol-detector', () => realProtocolDetector);
    mock.module('../../services/response-handlers', () => realResponseHandlers);
    mock.module('../../transformer', () => realTransformer);
    mock.module('../shared/failover-executor', () => realFailoverExecutor);
    mock.module('./chat-completion-executor', () => realChatCompletionExecutor);
  });

  it('returns 403 when virtualKey.allowedModels does not include requested model', async () => {
    const c = createMockContext({
      virtualKey: createTestVirtualKey({ allowedModels: ['gpt-3.5-turbo'] }),
    });

    const response = await handleOpenAIChatCompletion(c, false);
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toEqual({ error: { type: 'permission_error', message: 'Your API key does not have permission to use this model' } });
  });

  it('returns 404 via handleGatewayError when no candidates found', async () => {
    const mockRouteCandidates = accessModelRouter.routeCandidates as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockRouteCandidates.mockImplementation(async () => []);

    const c = createMockContext();
    const response = await handleOpenAIChatCompletion(c, false);

    expect(mockHandleGatewayError).toHaveBeenCalled();
    const calls = getMockCalls(mockHandleGatewayError);
    const error = calls[0][0] as { error: Error };
    expect(error.error.name).toBe('ModelNotFoundError');
    expect(error.error.message).toBe('Model not found: gpt-4');
  });

  it('catches missing transformer error and calls handleGatewayError', async () => {
    const mockGetTransformer = getTransformer as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void };
    mockGetTransformer.mockImplementation(() => undefined);

    const c = createMockContext();
    const response = await handleOpenAIChatCompletion(c, false);

    expect(mockHandleGatewayError).toHaveBeenCalled();
    const calls = getMockCalls(mockHandleGatewayError);
    const error = calls[0][0] as { error: Error };
    expect(error.error.message).toContain('No transformer found');
  });

  it('dispatches to handleStreamingResponse on successful streaming candidate', async () => {
    const mockExecuteFailover = executeFailoverIteration as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockExecuteFailover.mockImplementation(async () => ({
      type: 'success',
      response: new Response('stream', { status: 200 }),
      retryCount: 0,
    }));

    const c = createMockContext({ body: { model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }], stream: true } });
    const response = await handleOpenAIChatCompletion(c, true);

    expect(mockHandleStreamingResponse).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('dispatches to handleNonStreamingResponse on successful non-streaming candidate', async () => {
    const mockExecuteFailover2 = executeFailoverIteration as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockExecuteFailover2.mockImplementation(async () => ({
      type: 'success',
      response: new Response('non-stream', { status: 200 }),
      retryCount: 0,
    }));

    const c = createMockContext();
    const response = await handleOpenAIChatCompletion(c, false);

    expect(mockHandleNonStreamingResponse).toHaveBeenCalled();
    expect(response.status).toBe(200);
  });

  it('permission error has correct OpenAI shape', async () => {
    const c = createMockContext({
      virtualKey: createTestVirtualKey({ allowedModels: ['gpt-3.5-turbo'] }),
    });

    const response = await handleOpenAIChatCompletion(c, false);
    const body = await response.json();
    expect(body.error.type).toBe('permission_error');
    expect(body.error.message).toBe('Your API key does not have permission to use this model');
  });

  it('calls handleGatewayError when all candidates are exhausted', async () => {
    const mockExecuteFailover = executeFailoverIteration as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockExecuteFailover.mockImplementation(async () => ({
      type: 'failover',
      response: new Response('error', { status: 500 }),
      retryCount: 0,
    }));

    const c = createMockContext();
    await handleOpenAIChatCompletion(c, false);

    expect(mockHandleGatewayError).toHaveBeenCalled();
    const calls = getMockCalls(mockHandleGatewayError);
    const error = calls[0][0] as { error: Error };
    expect(error.error.message).toBe('All candidate instances exhausted');
  });

  it('returns 400 protocol_error when provider URL is missing on last candidate', async () => {
    const mockGetProviderUrl = getProviderUrl as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void };
    mockGetProviderUrl.mockImplementation(() => null);

    const mockRouteCandidates = accessModelRouter.routeCandidates as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockRouteCandidates.mockImplementation(async () => [createMockRouteResult()]);

    const c = createMockContext();
    const response = await handleOpenAIChatCompletion(c, false);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error.type).toBe('protocol_error');
    expect(body.error.message).toContain("not configured for provider");
  });

  it('continues to next candidate when provider URL is missing on non-last candidate', async () => {
    const mockGetProviderUrl = getProviderUrl as unknown as { mockImplementation: (fn: (...args: unknown[]) => unknown) => void };
    let callCount = 0;
    mockGetProviderUrl.mockImplementation(() => {
      callCount++;
      return callCount === 1 ? null : 'https://api.openai.com';
    });

    const mockRouteCandidates = accessModelRouter.routeCandidates as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockRouteCandidates.mockImplementation(async () => [
      createMockRouteResult({ instance: createTestModelInstance({ id: 'inst-1' }) }),
      createMockRouteResult({ instance: createTestModelInstance({ id: 'inst-2' }) }),
    ]);

    const mockExecuteFailover = executeFailoverIteration as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockExecuteFailover.mockImplementation(async () => ({
      type: 'success',
      response: new Response('{"id":"ok"}', { status: 200 }),
      retryCount: 0,
    }));

    const c = createMockContext();
    const response = await handleOpenAIChatCompletion(c, false);

    expect(response.status).toBe(200);
    const calls = getMockCalls(mockExecuteFailover);
    expect(calls.length).toBe(1);
  });

  it('failover: first candidate fails, second succeeds', async () => {
    const mockRouteCandidates = accessModelRouter.routeCandidates as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    mockRouteCandidates.mockImplementation(async () => [
      createMockRouteResult({ instance: createTestModelInstance({ id: 'inst-1' }) }),
      createMockRouteResult({ instance: createTestModelInstance({ id: 'inst-2' }) }),
    ]);

    const mockExecuteFailover = executeFailoverIteration as unknown as { mockImplementation: (fn: (...args: unknown[]) => Promise<unknown>) => void };
    let failoverCount = 0;
    mockExecuteFailover.mockImplementation(async () => {
      failoverCount++;
      if (failoverCount === 1) {
        return { type: 'failover', response: new Response('error', { status: 500 }), retryCount: 0 };
      }
      return { type: 'success', response: new Response('{"id":"ok"}', { status: 200 }), retryCount: 0 };
    });

    const c = createMockContext();
    const response = await handleOpenAIChatCompletion(c, false);

    expect(response.status).toBe(200);
    const calls = getMockCalls(mockExecuteFailover);
    expect(calls.length).toBe(2);
  });
});
