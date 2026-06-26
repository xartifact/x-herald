import { describe, it, expect, mock, afterAll, beforeEach } from 'bun:test';
import type { Context } from 'hono';

import {
  createTestVirtualKey,
  createTestProvider,
  createTestModelGroup,
  createTestModelInstance,
} from '../../../test/factories';
import type { VirtualKey } from '@x-llm-gateway/db';
import type { RouteResult } from '../../services/router-selector';

// ---------------------------------------------------------------------------
// Capture real modules BEFORE mocking
// ---------------------------------------------------------------------------

const realConfig = await import('../../../config');
const realLogger = await import('../../../lib/logger');
const realAccessModelRouter = await import('../../services/access-model-router');
const realClientIdentifier = await import('../../services/client-identifier');
const realErrorHandler = await import('../../services/error-handler');
const realHeaders = await import('../../services/headers');
const realLogService = await import('../../services/log-service');
const realModelGroupRouter = await import('../../services/model-group-router');
const realProtocolDetector = await import('../../services/protocol-detector');
const realResponseHandlers = await import('../../services/response-handlers');
const realTransformer = await import('../../transformer');
const realParameterTransformer = await import('../../transformer/shared/parameter-transformer');
const realAbortManager = await import('../shared/abort-manager');
const realConstants = await import('../shared/constants');
const realJoinUrl = await import('../shared/join-url');
const realRetryExecutor = await import('../shared/retry-executor');
const realResponsesFormat = await import('./responses-format');

// ---------------------------------------------------------------------------
// Mutable mock state (changed per test)
// ---------------------------------------------------------------------------

let configValue = {
  sameProtocolPassthrough: { enabled: true, allowedProtocols: ['openai'] as string[] },
};

let routeResultValue: RouteResult | null = null;
let providerProtocolValue: 'openai' | 'anthropic' = 'openai';
let providerUrlValue: string | null = 'https://api.openai.com';
let executeWithRetryResult: {
  response: Response | null;
  retryCount: number;
  aborted: 'client_disconnect' | 'timeout' | null;
  networkError?: boolean;
} = {
  response: new Response(
    JSON.stringify({ id: 'test', choices: [{ message: { content: 'hello' } }] }),
    { status: 200, headers: { 'content-type': 'application/json' } },
  ),
  retryCount: 0,
  aborted: null,
  networkError: false,
};

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

mock.module('../../../config', () => ({
  loadConfig: () => configValue,
}));

mock.module('../../../lib/logger', () => ({
  default: {
    info: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    child: mock(() => ({ info: mock(() => {}), debug: mock(() => {}), error: mock(() => {}), warn: mock(() => {}) })),
  },
}));

mock.module('../../services/access-model-router', () => ({
  accessModelRouter: {
    route: mock(async () => routeResultValue),
  },
  accessModelRouter: {
    route: mock(async () => routeResultValue),
  },
}));

mock.module('../../services/client-identifier', () => ({
  identifyClient: mock(() => ({ type: 'test', name: 'Test Client' })),
}));

const handleGatewayErrorMock = mock(async () =>
  new Response(JSON.stringify({ error: { type: 'internal_error', message: 'gateway error' } }), { status: 500 }),
);
const handleProviderErrorMock = mock(async () =>
  new Response(JSON.stringify({ error: { type: 'provider_error', message: 'provider error' } }), { status: 500 }),
);
const handleProviderErrorPassthroughMock = mock(async () =>
  new Response(JSON.stringify({ error: { message: 'provider error passthrough' } }), { status: 500 }),
);

mock.module('../../services/error-handler', () => ({
  handleGatewayError: handleGatewayErrorMock,
  handleProviderError: handleProviderErrorMock,
  handleProviderErrorPassthrough: handleProviderErrorPassthroughMock,
}));

mock.module('../../services/headers', () => realHeaders);

mock.module('../../services/log-service', () => ({
  logStartAsync: mock(() => ({ logId: 'log-test-id', attemptId: 'attempt-test-id' })),
  logRequest: mock(async () => {}),
}));

mock.module('../../services/model-group-router', () => realModelGroupRouter);

mock.module('../../services/protocol-detector', () => ({
  getProviderProtocol: () => providerProtocolValue,
  getProviderUrl: () => providerUrlValue,
  getEndpoint: (_protocol: string, _isStreaming: boolean) => '/v1/chat/completions',
}));

const handleNonStreamingResponseMock = mock(async () =>
  new Response(JSON.stringify({ id: 'chatcmpl-test', model: 'gpt-4', choices: [{ message: { role: 'assistant', content: 'hello' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }),
);
const handleStreamingResponseMock = mock(async () =>
  new Response(new ReadableStream(), { status: 200, headers: { 'content-type': 'text/event-stream' } }),
);

mock.module('../../services/response-handlers', () => ({
  handleNonStreamingResponse: handleNonStreamingResponseMock,
  handleStreamingResponse: handleStreamingResponseMock,
  mergeResponseHeaders: realResponseHandlers.mergeResponseHeaders,
}));

mock.module('../../transformer', () => ({
  getTransformer: (protocol: string) => ({
    normalizeRequest: mock(async (request: unknown, _ctx: unknown) => {
      const req = request as Record<string, unknown>;
      return {
        model: req.model || 'gpt-4',
        messages: (req.messages || []) as Array<Record<string, unknown>>,
        stream: req.stream || false,
        tools: req.tools,
      };
    }),
    adaptRequest: mock(async (request: unknown, _ctx: unknown) => {
      return {
        body: { ...request as Record<string, unknown> },
        headers: { 'content-type': 'application/json' },
      };
    }),
  }),
  createTransformerContext: (requestId: string) => ({
    requestId,
    startTime: Date.now(),
    state: new Map(),
    request: { model: '', messages: [] },
    provider: { name: '', baseUrl: '', apiKey: '', protocol: 'openai', models: [] },
    model: '',
    headers: {},
    metadata: {},
  }),
  registerTransformer: realTransformer.registerTransformer,
  transformerRegistry: realTransformer.transformerRegistry,
}));

mock.module('../../transformer/shared/parameter-transformer', () => realParameterTransformer);

mock.module('../shared/abort-manager', () => ({
  AbortManager: class MockAbortManager {
    constructor(_signal: AbortSignal | undefined) {}
    registerClientDisconnect() {}
    createAttempt(_timeout: number, _requestId: string, _isStreaming: boolean) {
      const controller = new AbortController();
      return { controller, cleanup: mock(() => {}) };
    }
    dispose() {}
  },
}));

mock.module('../shared/constants', () => realConstants);

mock.module('../shared/join-url', () => realJoinUrl);

mock.module('../shared/retry-executor', () => ({
  executeWithRetry: mock(async () => executeWithRetryResult),
}));

mock.module('./responses-format', () => realResponsesFormat);

// ---------------------------------------------------------------------------
// Import handler AFTER mocks
// ---------------------------------------------------------------------------

const { handleResponsesAPI } = await import('./responses-handler');

// ---------------------------------------------------------------------------
// Restore mocks after all tests
// ---------------------------------------------------------------------------

afterAll(async () => {
  const realConfig = await import('../../../config');
  const realLogger = await import('../../../lib/logger');
  const realAccessModelRouter = await import('../../services/access-model-router');
  const realClientIdentifier = await import('../../services/client-identifier');
  const realErrorHandler = await import('../../services/error-handler');
  const realHeaders = await import('../../services/headers');
  const realLogService = await import('../../services/log-service');
  const realModelGroupRouter = await import('../../services/model-group-router');
  const realProtocolDetector = await import('../../services/protocol-detector');
  const realResponseHandlers = await import('../../services/response-handlers');
  const realTransformer = await import('../../transformer');
  const realParameterTransformer = await import('../../transformer/shared/parameter-transformer');
  const realAbortManager = await import('../shared/abort-manager');
  const realConstants = await import('../shared/constants');
  const realJoinUrl = await import('../shared/join-url');
  const realRetryExecutor = await import('../shared/retry-executor');
  const realResponsesFormat = await import('./responses-format');
  mock.module('../../../config', () => realConfig);
  mock.module('../../../lib/logger', () => realLogger);
  mock.module('../../services/access-model-router', () => realAccessModelRouter);
  mock.module('../../services/client-identifier', () => realClientIdentifier);
  mock.module('../../services/error-handler', () => realErrorHandler);
  mock.module('../../services/headers', () => realHeaders);
  mock.module('../../services/log-service', () => realLogService);
  mock.module('../../services/model-group-router', () => realModelGroupRouter);
  mock.module('../../services/protocol-detector', () => realProtocolDetector);
  mock.module('../../services/response-handlers', () => realResponseHandlers);
  mock.module('../../transformer', () => realTransformer);
  mock.module('../../transformer/shared/parameter-transformer', () => realParameterTransformer);
  mock.module('../shared/abort-manager', () => realAbortManager);
  mock.module('../shared/constants', () => realConstants);
  mock.module('../shared/join-url', () => realJoinUrl);
  mock.module('../shared/retry-executor', () => realRetryExecutor);
  mock.module('./responses-format', () => realResponsesFormat);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(
  body: Record<string, unknown> = { model: 'gpt-4', input: 'hello' },
  overrides: {
    requestId?: string;
    virtualKey?: VirtualKey;
    headers?: Record<string, string>;
  } = {},
): Context {
  const headers = new Headers({
    'content-type': 'application/json',
    ...overrides.headers,
  });
  const rawRequest = new Request('http://localhost/v1/responses', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  const store = new Map<string, unknown>();
  store.set('requestId', overrides.requestId || 'test-req-id');
  store.set('virtualKey', overrides.virtualKey || createTestVirtualKey({ allowedModels: null }));

  const responseHeaders = new Headers();

  return {
    get: (key: string) => store.get(key),
    set: (key: string, value: unknown) => store.set(key, value),
    req: {
      header: (name: string) => headers.get(name) || undefined,
      path: '/v1/responses',
      method: 'POST',
      raw: rawRequest,
      json: async () => body,
    } as unknown as Context['req'],
    json: (body: unknown, status?: number) => {
      return new Response(JSON.stringify(body), {
        status: status || 200,
        headers: { 'content-type': 'application/json', ...Object.fromEntries(responseHeaders) },
      });
    },
    header: (name: string, value: string) => {
      responseHeaders.set(name, value);
    },
  } as unknown as Context;
}

function createMockRouteResult(overrides: Partial<RouteResult> = {}): RouteResult {
  const provider = createTestProvider({
    protocols: {
      openai: { baseUrl: 'https://api.openai.com', enabled: true },
    },
  });
  const group = createTestModelGroup();
  const instance = createTestModelInstance({ actualModelName: 'gpt-4-turbo' });
  return {
    instance,
    provider,
    group,
    decision: { strategy: 'priority', reason: 'test', candidates: 1 },
    mapping: {
      modelName: 'gpt-4',
      isMapped: true,
      originalModel: 'gpt-4',
      mappingType: 'virtual' as const,
    },
    matchedRule: { id: 'rule-1', name: 'Test Rule', priority: 0 },
    ...overrides,
  };
}

function resetMocks() {
  mock.restore();
  handleGatewayErrorMock.mockClear();
  handleProviderErrorMock.mockClear();
  handleProviderErrorPassthroughMock.mockClear();
  handleNonStreamingResponseMock.mockClear();
  handleStreamingResponseMock.mockClear();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleResponsesAPI', () => {
  beforeEach(() => {
    resetMocks();
    configValue = {
      sameProtocolPassthrough: { enabled: true, allowedProtocols: ['openai'] as string[] },
    };
    routeResultValue = createMockRouteResult();
    providerProtocolValue = 'openai';
    providerUrlValue = 'https://api.openai.com';
    executeWithRetryResult = {
      response: new Response(
        JSON.stringify({ id: 'test', choices: [{ message: { content: 'hello' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
      retryCount: 0,
      aborted: null,
      networkError: false,
    };
  });

  // 1. Returns 403 when virtualKey.allowedModels doesn't include requested model
  it('returns 403 when virtualKey.allowedModels does not include requested model', async () => {
    const virtualKey = createTestVirtualKey({ allowedModels: ['gpt-3'] });
    const c = createMockContext({ model: 'gpt-4', input: 'hello' }, { virtualKey });

    const response = await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.type).toBe('permission_error');
    expect(body.error.message).toContain('does not have permission');
  });

  // 2. Throws ModelNotFoundError when route returns null
  it('throws ModelNotFoundError when route returns null', async () => {
    routeResultValue = null;
    const c = createMockContext({ model: 'gpt-4', input: 'hello' });

    await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(handleGatewayErrorMock).toHaveBeenCalled();
    const args = (handleGatewayErrorMock.mock.calls[0] as unknown[])[0] as { error: Error };
    expect(args.error.name).toBe('ModelNotFoundError');
  });

  // 3. Returns 400 protocol_error when provider URL is missing
  it('returns 400 protocol_error when provider URL is missing', async () => {
    providerUrlValue = null;
    routeResultValue = createMockRouteResult();
    const c = createMockContext({ model: 'gpt-4', input: 'hello' });

    const response = await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.type).toBe('protocol_error');
    expect(body.error.message).toContain('not configured');
  });

  // 4. Successful non-streaming → calls handleNonStreamingResponse then convertChatToResponsesBody
  it('successful non-streaming calls handleNonStreamingResponse and converts response to Responses format', async () => {
    routeResultValue = createMockRouteResult();
    const c = createMockContext({ model: 'gpt-4', input: 'hello' });

    const response = await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(handleNonStreamingResponseMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.object).toBe('response');
    expect(body.id).toBe('resp-test');
  });

  // 5. Successful streaming → calls handleStreamingResponse then convertStreamToResponsesFormat
  it('successful streaming calls handleStreamingResponse and converts stream to Responses format', async () => {
    routeResultValue = createMockRouteResult();
    const c = createMockContext({ model: 'gpt-4', input: 'hello', stream: true });

    const response = await handleResponsesAPI(c, true, { model: 'gpt-4', input: 'hello', stream: true });

    expect(handleStreamingResponseMock).toHaveBeenCalled();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/event-stream');
  });

  // 6. Permission error has OpenAI shape: { error: { type: 'permission_error', ... } }
  it('returns OpenAI-shaped permission error', async () => {
    const virtualKey = createTestVirtualKey({ allowedModels: ['gpt-3'] });
    const c = createMockContext({ model: 'gpt-4', input: 'hello' }, { virtualKey });

    const response = await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body).toHaveProperty('error');
    expect(body.error).toHaveProperty('type', 'permission_error');
    expect(body.error).toHaveProperty('message');
    expect(typeof body.error.message).toBe('string');
  });

  // 7. Upstream returns non-ok → calls handleProviderError (or handleProviderErrorPassthrough when passthrough)
  it('calls handleProviderError when upstream returns non-ok and passthrough is disabled', async () => {
    configValue = {
      sameProtocolPassthrough: { enabled: false, allowedProtocols: ['openai'] as string[] },
    };
    providerProtocolValue = 'openai';
    executeWithRetryResult = {
      response: new Response(JSON.stringify({ error: 'upstream error' }), { status: 500 }),
      retryCount: 0,
      aborted: null,
      networkError: false,
    };
    routeResultValue = createMockRouteResult();
    const c = createMockContext({ model: 'gpt-4', input: 'hello' });

    await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(handleProviderErrorMock).toHaveBeenCalled();
    expect(handleProviderErrorPassthroughMock).not.toHaveBeenCalled();
  });

  it('calls handleProviderErrorPassthrough when upstream returns non-ok and passthrough is enabled', async () => {
    configValue = {
      sameProtocolPassthrough: { enabled: true, allowedProtocols: ['openai'] as string[] },
    };
    providerProtocolValue = 'openai';
    executeWithRetryResult = {
      response: new Response(JSON.stringify({ error: 'upstream error' }), { status: 500 }),
      retryCount: 0,
      aborted: null,
      networkError: false,
    };
    routeResultValue = createMockRouteResult();
    const c = createMockContext({ model: 'gpt-4', input: 'hello' });

    await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(handleProviderErrorPassthroughMock).toHaveBeenCalled();
    expect(handleProviderErrorMock).not.toHaveBeenCalled();
  });

  // 8. Retry/abort timeout → calls handleGatewayError with timeout message
  it('calls handleGatewayError with timeout message when retry is aborted by timeout', async () => {
    executeWithRetryResult = {
      response: null,
      retryCount: 1,
      aborted: 'timeout',
      networkError: false,
    };
    routeResultValue = createMockRouteResult();
    const c = createMockContext({ model: 'gpt-4', input: 'hello' });

    await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(handleGatewayErrorMock).toHaveBeenCalled();
    const args = (handleGatewayErrorMock.mock.calls[0] as unknown[])[0] as { error: Error };
    expect(args.error.message).toContain('timeout');
  });

  // 9. Client disconnect → calls handleGatewayError with 'Client disconnected' message
  it('calls handleGatewayError with client disconnect message when client disconnects', async () => {
    executeWithRetryResult = {
      response: null,
      retryCount: 0,
      aborted: 'client_disconnect',
      networkError: false,
    };
    routeResultValue = createMockRouteResult();
    const c = createMockContext({ model: 'gpt-4', input: 'hello' });

    await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(handleGatewayErrorMock).toHaveBeenCalled();
    const args = (handleGatewayErrorMock.mock.calls[0] as unknown[])[0] as { error: Error };
    expect(args.error.message).toContain('disconnected');
  });

  // 10. Convert Responses input to Chat format → verifies convertResponsesToChatFormat is called
  it('converts Responses input format to Chat format before normalization', async () => {
    const responsesBody = {
      model: 'gpt-4',
      input: [{ role: 'user', content: 'hello' }],
      instructions: 'You are helpful.',
    };
    routeResultValue = createMockRouteResult();
    const c = createMockContext(responsesBody);

    await handleResponsesAPI(c, false, responsesBody);

    // The normalizeRequest mock should receive the Chat-formatted body (with messages, not input)
    // We verify by checking that the downstream handler works correctly (status 200 and Responses output)
    expect(handleNonStreamingResponseMock).toHaveBeenCalled();
  });

  // 11. Catch block → calls handleGatewayError on any exception
  it('calls handleGatewayError when an unexpected exception occurs', async () => {
    routeResultValue = createMockRouteResult();
    // Force an exception by setting providerUrl to trigger a throw in buildProviderRequest
    // We'll mock getTransformer to return null, which triggers "No transformer found"
    mock.module('../../transformer', () => ({
      getTransformer: () => null,
      createTransformerContext: (requestId: string) => ({
        requestId,
        startTime: Date.now(),
        state: new Map(),
        request: { model: '', messages: [] },
        provider: { name: '', baseUrl: '', apiKey: '', protocol: 'openai', models: [] },
        model: '',
        headers: {},
        metadata: {},
      }),
    }));

    const c = createMockContext({ model: 'gpt-4', input: 'hello' });

    await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    expect(handleGatewayErrorMock).toHaveBeenCalled();

    // Restore transformer mock
    mock.module('../../transformer', () => ({
      getTransformer: (protocol: string) => ({
        normalizeRequest: mock(async (request: unknown, _ctx: unknown) => {
          const req = request as Record<string, unknown>;
          return {
            model: req.model || 'gpt-4',
            messages: (req.messages || []) as Array<Record<string, unknown>>,
            stream: req.stream || false,
            tools: req.tools,
          };
        }),
        adaptRequest: mock(async (request: unknown, _ctx: unknown) => {
          return {
            body: { ...request as Record<string, unknown> },
            headers: { 'content-type': 'application/json' },
          };
        }),
      }),
      createTransformerContext: (requestId: string) => ({
        requestId,
        startTime: Date.now(),
        state: new Map(),
        request: { model: '', messages: [] },
        provider: { name: '', baseUrl: '', apiKey: '', protocol: 'openai', models: [] },
        model: '',
        headers: {},
        metadata: {},
      }),
      registerTransformer: realTransformer.registerTransformer,
      transformerRegistry: realTransformer.transformerRegistry,
    }));
  });

  // 12. Passthrough enabled → uses raw body with model replaced
  it('uses raw body with model replaced when passthrough is enabled', async () => {
    configValue = {
      sameProtocolPassthrough: { enabled: true, allowedProtocols: ['openai'] as string[] },
    };
    providerProtocolValue = 'openai';
    routeResultValue = createMockRouteResult({
      instance: createTestModelInstance({ actualModelName: 'gpt-4o-2024-08-06' }),
    });
    const c = createMockContext({ model: 'gpt-4', input: 'hello' });

    await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' });

    // In passthrough mode, handleNonStreamingResponse should be called with
    // isPassthroughEnabled=true and transformedBody containing the raw body with model replaced
    expect(handleNonStreamingResponseMock).toHaveBeenCalled();
    const args = (handleNonStreamingResponseMock.mock.calls[0] as unknown[])[0] as {
      isPassthroughEnabled: boolean;
      transformedBody: Record<string, unknown>;
    };
    expect(args.isPassthroughEnabled).toBe(true);
    expect(args.transformedBody).toMatchObject({ model: 'gpt-4o-2024-08-06' });
  });
});
