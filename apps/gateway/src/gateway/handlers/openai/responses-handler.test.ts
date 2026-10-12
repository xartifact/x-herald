import { describe, it, expect, mock, afterAll, beforeEach } from 'bun:test'
import type { Context } from 'hono'

import {
  createTestVirtualKey,
  createTestProvider,
  createTestModelGroup,
  createTestModelInstance,
} from '../../../test/factories'
import type { VirtualKey } from '@xartifact/x-herald-db'
import type { RouteResult } from '../../services/router-selector'

// ---------------------------------------------------------------------------
// Capture real modules BEFORE mocking
//
// Responses 端点是纯透传路径（不经过 transformer 链），测试按该语义 mock：
// 路由 → buildProviderRequest（仅替换 model + authorization）→ fetch →
// 原样回传（错误路径重建 body、成功路径透传/回映射）。
// ---------------------------------------------------------------------------

const realLogger = await import('../../../lib/logger')
const realAccessModelRouter = await import('../../services/access-model-router')
const realClientIdentifier = await import('../../services/client-identifier')
const realErrorHandler = await import('../../services/error-handler')
const realHeaders = await import('../../services/headers')
const realLogService = await import('../../services/log-service')
const realModelGroupRouter = await import('../../services/model-group-router')
const realResponseHandlersShared = await import('../../services/response-handlers/shared')
const realAbortManager = await import('../shared/abort-manager')
const realJoinUrl = await import('../shared/join-url')
const realRetryExecutor = await import('../shared/retry-executor')
const realTtfbTimeoutPolicy = await import('../../services/ttfb-timeout-policy')

// ---------------------------------------------------------------------------
// Mutable mock state (changed per test)
// ---------------------------------------------------------------------------

let routeResultValue: RouteResult | null = null
let executeWithRetryResult: {
  response: Response | null
  retryCount: number
  aborted: 'client_disconnect' | 'timeout' | null
  networkError?: boolean
} = {
  response: null,
  retryCount: 0,
  aborted: null,
  networkError: false,
}

// ---------------------------------------------------------------------------
// Mock modules
// ---------------------------------------------------------------------------

mock.module('../../../lib/logger', () => ({
  default: {
    info: mock(() => {}),
    debug: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    child: mock(() => ({
      info: mock(() => {}),
      debug: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
    })),
  },
}))

mock.module('../../services/access-model-router', () => ({
  accessModelRouter: {
    route: mock(async () => routeResultValue),
  },
}))

mock.module('../../services/client-identifier', () => ({
  identifyClient: mock(() => ({ type: 'test', name: 'Test Client' })),
}))

const handleGatewayErrorMock = mock(
  async () =>
    new Response(JSON.stringify({ error: { type: 'internal_error', message: 'gateway error' } }), {
      status: 500,
    }),
)

mock.module('../../services/error-handler', () => ({
  handleGatewayError: handleGatewayErrorMock,
}))

mock.module('../../services/headers', () => realHeaders)

const logRequestMock = mock(async () => {})
mock.module('../../services/log-service', () => ({
  logStartAsync: mock(() => ({ logId: 'log-test-id', attemptId: 'attempt-test-id' })),
  logRequest: logRequestMock,
}))

mock.module('../../services/model-group-router', () => realModelGroupRouter)

// StreamResponseCollector 保持真实实现（验证 usage 采集语义），
// 只 mock markStreamAborted 避免触库。
const markStreamAbortedMock = mock(async () => {})
mock.module('../../services/log-stream', () => ({
  markStreamAborted: markStreamAbortedMock,
}))

mock.module('../../services/response-handlers/shared', () => realResponseHandlersShared)

mock.module('../shared/abort-manager', () => ({
  AbortManager: class MockAbortManager {
    isClientDisconnected = false
    constructor(_signal: AbortSignal | undefined) {}
    registerClientDisconnect() {}
    createAttempt(_timeout: number, _requestId: string, _isStreaming: boolean) {
      const controller = new AbortController()
      return { controller, cleanup: mock(() => {}) }
    }
    dispose() {}
  },
}))

mock.module('../shared/join-url', () => realJoinUrl)

mock.module('../shared/retry-executor', () => ({
  executeWithRetry: mock(async () => executeWithRetryResult),
}))

mock.module('../../services/ttfb-timeout-policy', () => realTtfbTimeoutPolicy)

// ---------------------------------------------------------------------------
// Import handler AFTER mocks
// ---------------------------------------------------------------------------

const { handleResponsesAPI } = await import('./responses-handler')

// ---------------------------------------------------------------------------
// Restore mocks after all tests
// ---------------------------------------------------------------------------

afterAll(async () => {
  mock.module('../../../lib/logger', () => realLogger)
  mock.module('../../services/access-model-router', () => realAccessModelRouter)
  mock.module('../../services/client-identifier', () => realClientIdentifier)
  mock.module('../../services/error-handler', () => realErrorHandler)
  mock.module('../../services/headers', () => realHeaders)
  mock.module('../../services/log-service', () => realLogService)
  mock.module('../../services/model-group-router', () => realModelGroupRouter)
  mock.module('../../services/log-stream', () => ({
    markStreamAborted: markStreamAbortedMock,
  }))
  mock.module('../../services/response-handlers/shared', () => realResponseHandlersShared)
  mock.module('../shared/abort-manager', () => realAbortManager)
  mock.module('../shared/join-url', () => realJoinUrl)
  mock.module('../shared/retry-executor', () => realRetryExecutor)
  mock.module('../../services/ttfb-timeout-policy', () => realTtfbTimeoutPolicy)
})

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(
  body: Record<string, unknown> = { model: 'gpt-4', input: 'hello' },
  overrides: {
    requestId?: string
    virtualKey?: VirtualKey
    headers?: Record<string, string>
  } = {},
): Context {
  const headers = new Headers({
    'content-type': 'application/json',
    ...overrides.headers,
  })
  const rawRequest = new Request('http://localhost/v1/responses', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const store = new Map<string, unknown>()
  store.set('requestId', overrides.requestId || 'test-req-id')
  store.set('virtualKey', overrides.virtualKey || createTestVirtualKey({ allowedModels: null }))

  const responseHeaders = new Headers()

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
      })
    },
    header: (name: string, value: string) => {
      responseHeaders.set(name, value)
    },
  } as unknown as Context
}

function createMockRouteResult(overrides: Partial<RouteResult> = {}): RouteResult {
  const provider = createTestProvider({
    protocols: {
      openai: { baseUrl: 'https://api.openai.com', enabled: true },
    },
  })
  const group = createTestModelGroup()
  const instance = createTestModelInstance({ actualModelName: 'gpt-4-turbo' })
  return {
    instance,
    provider,
    group,
    decision: { strategy: 'priority', reason: 'test', candidates: 1 },
    mapping: {
      modelName: 'gpt-4',
      isMapped: false,
      originalModel: 'gpt-4',
      mappingType: 'virtual' as const,
    },
    matchedRule: { id: 'rule-1', name: 'Test Rule', priority: 0 },
    ...overrides,
  }
}

function resetMocks() {
  mock.restore()
  handleGatewayErrorMock.mockClear()
  logRequestMock.mockClear()
  markStreamAbortedMock.mockClear()
}

// ---------------------------------------------------------------------------
// Tests — 透传语义
// ---------------------------------------------------------------------------

describe('handleResponsesAPI', () => {
  beforeEach(() => {
    resetMocks()
    routeResultValue = createMockRouteResult()
    executeWithRetryResult = {
      response: null,
      retryCount: 0,
      aborted: null,
      networkError: false,
    }
  })

  it('returns 403 when virtualKey.allowedModels does not include requested model', async () => {
    const virtualKey = createTestVirtualKey({ allowedModels: ['gpt-3.5'] })
    const c = createMockContext({ model: 'gpt-4', input: 'hello' }, { virtualKey })

    const response = await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' })

    expect(response.status).toBe(403)
    const body = (await response.json()) as Record<string, unknown>
    expect((body.error as Record<string, unknown>).type).toBe('permission_error')
  })

  it('throws ModelNotFoundError when route returns null', async () => {
    routeResultValue = null
    const c = createMockContext({ model: 'unknown-model', input: 'hello' })

    await handleResponsesAPI(c, false, { model: 'unknown-model', input: 'hello' })

    expect(handleGatewayErrorMock).toHaveBeenCalled()
  })

  it('returns 400 protocol_error when provider has no openai protocol baseUrl', async () => {
    routeResultValue = createMockRouteResult({
      provider: createTestProvider({
        protocols: { openai: { baseUrl: null, enabled: true } },
      }),
    })
    const c = createMockContext({ model: 'gpt-4', input: 'hello' })

    const response = await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' })

    expect(response.status).toBe(400)
    const body = (await response.json()) as Record<string, unknown>
    expect((body.error as Record<string, unknown>).type).toBe('protocol_error')
  })

  it('returns 400 protocol_error when provider disables the openai protocol', async () => {
    routeResultValue = createMockRouteResult({
      provider: createTestProvider({
        protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: false } },
      }),
    })
    const c = createMockContext({ model: 'gpt-4', input: 'hello' })

    const response = await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' })

    expect(response.status).toBe(400)
    const body = (await response.json()) as Record<string, unknown>
    expect((body.error as Record<string, unknown>).message).toContain('does not enable')
  })

  it('forwards the request body untouched except model, and passes upstream response through', async () => {
    // 透传语义：body 除 model 外原样转发（包括 tools/instructions/reasoning 等 Responses 专有字段）
    const responsesBody = {
      model: 'gpt-4',
      input: [{ role: 'user', content: 'hello' }],
      instructions: 'You are helpful.',
      reasoning: { effort: 'high' },
      tools: [{ type: 'function', name: 'get_weather', parameters: { type: 'object' } }],
    }
    const upstreamBody = {
      object: 'response',
      id: 'resp_test',
      model: 'gpt-4-turbo',
      output: [{ type: 'message', role: 'assistant', content: [] }],
      usage: { input_tokens: 11, output_tokens: 7, total_tokens: 18 },
    }
    executeWithRetryResult = {
      response: new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      retryCount: 0,
      aborted: null,
      networkError: false,
    }
    const c = createMockContext(responsesBody)

    const response = await handleResponsesAPI(c, false, responsesBody)

    expect(response.status).toBe(200)
    const body = (await response.json()) as Record<string, unknown>
    expect(body.object).toBe('response')

    // usage 透传给 logRequest（token 配额扣减依赖此字段）
    const logArgs = logRequestMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(logArgs.inputTokens).toBe(11)
    expect(logArgs.outputTokens).toBe(7)
  })

  it('reconstructs the upstream error body instead of reusing the consumed stream', async () => {
    // 回归：parseProviderError 消费 body 后复用 upstreamResponse.body 会抛
    // "Body object should not be disturbed or locked"，错误被吞成网关 500。
    const upstreamError = {
      error: { type: 'invalid_request_error', message: 'bad parameter' },
    }
    executeWithRetryResult = {
      response: new Response(JSON.stringify(upstreamError), {
        status: 400,
        headers: { 'content-type': 'application/json' },
      }),
      retryCount: 0,
      aborted: null,
      networkError: false,
    }
    const c = createMockContext({ model: 'gpt-4', input: 'hello' })

    const response = await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' })

    expect(response.status).toBe(400)
    expect(handleGatewayErrorMock).not.toHaveBeenCalled()
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toEqual(upstreamError)
  })

  it('rewrites the response model to the original model name when mapping is enabled', async () => {
    routeResultValue = createMockRouteResult({
      mapping: {
        modelName: 'gpt-4',
        isMapped: true,
        originalModel: 'my-alias',
        mappingType: 'alias' as const,
      },
    })
    const upstreamBody = {
      object: 'response',
      model: 'gpt-4-turbo',
      output: [],
      usage: { input_tokens: 1, output_tokens: 2, total_tokens: 3 },
    }
    executeWithRetryResult = {
      response: new Response(JSON.stringify(upstreamBody), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      retryCount: 0,
      aborted: null,
      networkError: false,
    }
    const c = createMockContext({ model: 'my-alias', input: 'hello' })

    const response = await handleResponsesAPI(c, false, { model: 'my-alias', input: 'hello' })

    const body = (await response.json()) as Record<string, unknown>
    expect(body.model).toBe('my-alias')
  })

  it('collects usage from response.completed events in the streaming path', async () => {
    const events = [
      'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-4-turbo"}}\n\n',
      'data: {"type":"response.output_text.delta","delta":"he"}\n\n',
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-4-turbo","usage":{"input_tokens":13,"output_tokens":5,"total_tokens":18}}}\n\n',
      'data: [DONE]\n\n',
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(new TextEncoder().encode(event))
        controller.close()
      },
    })
    executeWithRetryResult = {
      response: new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
      retryCount: 0,
      aborted: null,
      networkError: false,
    }
    const c = createMockContext({ model: 'gpt-4', input: 'hello', stream: true })

    const response = await handleResponsesAPI(c, true, {
      model: 'gpt-4',
      input: 'hello',
      stream: true,
    })

    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('text/event-stream')
    // 消费完整个流，触发 flush → finalize → logRequest
    await response.text()

    const logArgs = logRequestMock.mock.calls.at(-1)?.[0] as Record<string, unknown>
    expect(logArgs.inputTokens).toBe(13)
    expect(logArgs.outputTokens).toBe(5)
    expect(logArgs.status).toBe('success')
  })

  it('marks the stream log aborted when the client cancels mid-stream', async () => {
    const events = [
      'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-4-turbo"}}\n\n',
      'data: {"type":"response.output_text.delta","delta":"partial"}\n\n',
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(new TextEncoder().encode(event))
        // 不 close：模拟上游流仍在进行时客户端断开
      },
    })
    executeWithRetryResult = {
      response: new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
      retryCount: 0,
      aborted: null,
      networkError: false,
    }
    const c = createMockContext({ model: 'gpt-4', input: 'hello', stream: true })

    const response = await handleResponsesAPI(c, true, {
      model: 'gpt-4',
      input: 'hello',
      stream: true,
    })

    // 客户端取消读取 → monitor.cancel() → markStreamAborted
    await response.body?.cancel('client-gone')
    // cancel 是异步传播的，给微任务一个周转机会
    await new Promise<void>((resolve) => setTimeout(resolve, 20))

    expect(markStreamAbortedMock).toHaveBeenCalledWith(
      'log-test-id',
      'attempt-test-id',
      false,
      expect.objectContaining({ usage: expect.anything() }),
    )
  })

  it('remaps response model in stream events when mapping is enabled', async () => {
    routeResultValue = createMockRouteResult({
      mapping: {
        modelName: 'gpt-4',
        isMapped: true,
        originalModel: 'my-alias',
        mappingType: 'alias' as const,
      },
    })
    const events = [
      'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-4-turbo"}}\n\n',
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-4-turbo","usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
      'data: [DONE]\n\n',
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(new TextEncoder().encode(event))
        controller.close()
      },
    })
    executeWithRetryResult = {
      response: new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
      retryCount: 0,
      aborted: null,
      networkError: false,
    }
    const c = createMockContext({ model: 'my-alias', input: 'hello', stream: true })

    const response = await handleResponsesAPI(c, true, {
      model: 'my-alias',
      input: 'hello',
      stream: true,
    })

    const text = await response.text()
    expect(text).not.toContain('gpt-4-turbo')
    expect(text).toContain('"my-alias"')
  })

  it('records response body summary for completed responses streams (detail view content)', async () => {
    const events = [
      'data: {"type":"response.created","response":{"id":"resp_1","model":"gpt-4-turbo"}}\n\n',
      'data: {"type":"response.completed","response":{"id":"resp_1","model":"gpt-4-turbo","usage":{"input_tokens":1,"output_tokens":1}}}\n\n',
      'data: [DONE]\n\n',
    ]
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const event of events) controller.enqueue(new TextEncoder().encode(event))
        controller.close()
      },
    })
    executeWithRetryResult = {
      response: new Response(stream, {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      }),
      retryCount: 0,
      aborted: null,
      networkError: false,
    }
    const c = createMockContext({ model: 'gpt-4', input: 'hello', stream: true })

    const response = await handleResponsesAPI(c, true, {
      model: 'gpt-4',
      input: 'hello',
      stream: true,
    })
    await response.text() // 读完流触发 flush/finalize

    // finalize 的 logRequest 必须带 response body 摘要（此前恒空 → 详情页 Response 空）
    expect(logRequestMock).toHaveBeenCalled()
    const call = logRequestMock.mock.calls.at(-1)?.[0] as {
      responseBody?: { streamContent?: { allChunks?: unknown[] } }
    }
    expect(call.responseBody?.streamContent?.allChunks?.length).toBeGreaterThan(0)
  })

  it('calls handleGatewayError with timeout message when retry is aborted by timeout', async () => {
    executeWithRetryResult = {
      response: null,
      retryCount: 1,
      aborted: 'timeout',
      networkError: false,
    }
    const c = createMockContext({ model: 'gpt-4', input: 'hello' })

    await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' })

    expect(handleGatewayErrorMock).toHaveBeenCalled()
    const args = (handleGatewayErrorMock.mock.calls[0] as unknown[])[0] as { error: Error }
    expect(args.error.message).toContain('timeout')
  })

  it('marks the log cancelled (not 500) when the client disconnects before TTFB', async () => {
    executeWithRetryResult = {
      response: null,
      retryCount: 0,
      aborted: 'client_disconnect',
      networkError: false,
    }
    const c = createMockContext({ model: 'gpt-4', input: 'hello' })

    const response = await handleResponsesAPI(c, false, { model: 'gpt-4', input: 'hello' })

    // 客户端已断开：不再走 handleGatewayError（曾产生 500/internal_error 误分类）
    expect(handleGatewayErrorMock).not.toHaveBeenCalled()
    expect(response.status).toBe(499)
    expect(markStreamAbortedMock).toHaveBeenCalledWith('log-test-id', 'attempt-test-id', false, {
      forceCancelled: true,
    })
  })
})
