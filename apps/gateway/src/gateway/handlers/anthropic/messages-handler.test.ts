import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'
import type { Context } from 'hono'
import type { VirtualKey } from '@xartifact/x-llm-gateway-db'
import {
  createTestVirtualKey,
  createTestProvider,
  createTestModelGroup,
  createTestModelInstance,
} from '../../../test/factories'

// ---------------------------------------------------------------------------
// Mock modules BEFORE importing the test target
// ---------------------------------------------------------------------------

const mockLoadConfig = mock(() => ({
  sameProtocolPassthrough: { enabled: false, allowedProtocols: [] },
}))
mock.module('../../../config', () => ({ loadConfig: mockLoadConfig }))

const mockLogger = {
  info: mock(() => {}),
  debug: mock(() => {}),
  error: mock(() => {}),
  warn: mock(() => {}),
}
mock.module('../../../lib/logger', () => ({ default: mockLogger }))

const mockRouteCandidates = mock(async (): Promise<unknown[]> => [])
mock.module('../../services/access-model-router', () => ({
  accessModelRouter: { routeCandidates: mockRouteCandidates },
}))

const mockIdentifyClient = mock(() => ({ type: 'unknown' }))
mock.module('../../services/client-identifier', () => ({
  identifyClient: mockIdentifyClient,
}))

const mockHandleGatewayError = mock(async () => new Response('gateway error', { status: 500 }))
mock.module('../../services/error-handler', () => ({
  handleGatewayError: mockHandleGatewayError,
}))

const mockLogEventBus = { emitLog: mock(() => {}) }
mock.module('../../services/log-event-bus', () => ({ logEventBus: mockLogEventBus }))

const MockModelNotFoundError = class extends Error {
  constructor(model: string) {
    super(`Model not found: ${model}`)
    this.name = 'ModelNotFoundError'
  }
}
mock.module('../../services/model-group-router', () => ({
  ModelNotFoundError: MockModelNotFoundError,
}))

const mockGetProviderProtocol = mock(() => 'anthropic')
const mockGetProviderUrl = mock((): string | undefined => 'https://api.anthropic.com')
mock.module('../../services/protocol-detector', () => ({
  getProviderProtocol: mockGetProviderProtocol,
  getProviderUrl: mockGetProviderUrl,
}))

const mockHandleNonStreamingResponse = mock(async () => new Response('{}', { status: 200 }))
const mockHandleStreamingResponse = mock(async () => new Response('stream', { status: 200 }))
mock.module('../../services/response-handlers', () => ({
  handleNonStreamingResponse: mockHandleNonStreamingResponse,
  handleStreamingResponse: mockHandleStreamingResponse,
}))

const mockNormalizeRequest = mock(async () => ({
  model: 'claude-3',
  messages: [],
  stream: false,
}))
const mockAdaptRequest = mock(async () => ({
  body: { model: 'gpt-4' },
  headers: { 'content-type': 'application/json' },
  url: 'https://api.openai.com/v1/chat',
}))
const mockGetTransformer = mock(() => ({
  normalizeRequest: mockNormalizeRequest,
  adaptRequest: mockAdaptRequest,
}))
const mockCreateTransformerContext = mock(() => ({ provider: {}, instanceConfig: {} }))
mock.module('../../transformer', () => ({
  getTransformer: mockGetTransformer,
  createTransformerContext: mockCreateTransformerContext,
}))

const MockAbortManager = class {
  registerClientDisconnect = mock(() => {})
  setLogId = mock(() => {})
  dispose = mock(() => {})
}
mock.module('../shared/abort-manager', () => ({ AbortManager: MockAbortManager }))

const mockExecuteFailoverIteration = mock(async () => ({
  type: 'success',
  response: new Response('{}', { status: 200 }),
  retryCount: 0,
}))
mock.module('../shared/failover-executor', () => ({
  executeFailoverIteration: mockExecuteFailoverIteration,
}))

// Mock executor
const mockExecutorPrepareRequest = mock(async () => ({
  url: 'https://api.anthropic.com',
  headers: {},
  body: '{}',
  isPassthroughEnabled: false,
  targetProtocol: 'anthropic',
}))
const mockExecutorBeforeFetch = mock(() => {})
const mockExecutorRetry = mock(() => {})
const mockExecutorRecordFailure = mock(() => {})
const mockExecutorRecordSuccess = mock(() => {})
const mockExecutorMarkLogFailed = mock(async () => {})
const mockExecutorEmitAbortedEvent = mock(() => {})
const mockExecutorGatewayError = mock(async () => new Response('error', { status: 500 }))
const mockExecutorProviderError = mock(async () => new Response('error', { status: 500 }))
const mockExecutorProviderErrorPassthrough = mock(
  async () => new Response('error', { status: 500 }),
)

const MockAnthropicMessagesExecutor = class {
  logId = 'log-1'
  attemptId = 'attempt-1'
  preprocessEndTime = Date.now()
  transformedBody = {}
  providerRequestHeaders = {}
  prepareRequest = mockExecutorPrepareRequest
  beforeFetch = mockExecutorBeforeFetch
  retry = mockExecutorRetry
  recordFailure = mockExecutorRecordFailure
  recordSuccess = mockExecutorRecordSuccess
  markLogFailed = mockExecutorMarkLogFailed
  emitAbortedEvent = mockExecutorEmitAbortedEvent
  gatewayError = mockExecutorGatewayError
  providerError = mockExecutorProviderError
  providerErrorPassthrough = mockExecutorProviderErrorPassthrough
}
mock.module('./messages-executor', () => ({
  AnthropicMessagesExecutor: MockAnthropicMessagesExecutor,
}))

// ---------------------------------------------------------------------------
// Import test target AFTER all mocks
// ---------------------------------------------------------------------------
import { handleAnthropicMessages } from './messages-handler'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createMockContext(
  options: {
    virtualKey?: VirtualKey
    preprocessedBody?: Record<string, unknown>
    headers?: Record<string, string>
    path?: string
    method?: string
  } = {},
): Context {
  const headers = new Headers()
  Object.entries(options.headers || {}).forEach(([k, v]) => headers.set(k, v))
  const abortController = new AbortController()

  const virtualKey = options.virtualKey ?? createTestVirtualKey()

  return {
    req: {
      path: options.path ?? '/v1/messages',
      method: options.method ?? 'POST',
      header: (name: string) => {
        const lowerName = name.toLowerCase()
        const allHeaders: Record<string, string> = {
          'x-forwarded-for': '127.0.0.1',
          'user-agent': 'test-agent',
          'x-conversation-id': 'conv-1',
          ...options.headers,
        }
        return allHeaders[lowerName] || null
      },
      raw: {
        headers,
        signal: abortController.signal,
      },
      json: async () => ({}),
    } as unknown as Context['req'],
    get: (key: string) => {
      if (key === 'requestId') return 'test-req-1'
      if (key === 'virtualKey') return virtualKey
      return undefined
    },
    json: (body: unknown, status?: number) => {
      return new Response(JSON.stringify(body), { status: status || 200 })
    },
  } as unknown as Context
}

function createMockCandidate(modelName: string = 'claude-3-sonnet') {
  return {
    instance: createTestModelInstance({ actualModelName: modelName }),
    provider: createTestProvider({
      protocols: {
        anthropic: {
          baseUrl: 'https://api.anthropic.com',
          enabled: true,
        },
      },
    }),
    group: createTestModelGroup(),
    decision: { strategy: 'priority' },
    mapping: {
      originalModel: modelName,
      modelName,
      mappingType: 'exact',
      isMapped: false,
    },
    matchedRule: { id: 'rule-1', name: 'Test Rule', priority: 1 },
  }
}

function getMockCalls(fn: unknown): unknown[][] {
  return (fn as unknown as { mock: { calls: unknown[][] } }).mock.calls
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('handleAnthropicMessages', () => {
  beforeEach(() => {
    mock.restore()
    mockHandleGatewayError.mockClear()
    mockExecuteFailoverIteration.mockClear()
    mockHandleNonStreamingResponse.mockClear()
    mockHandleStreamingResponse.mockClear()
    mockRouteCandidates.mockClear()
    mockNormalizeRequest.mockClear()
    mockGetTransformer.mockClear()
    mockGetProviderUrl.mockClear()

    mockLoadConfig.mockImplementation(() => ({
      sameProtocolPassthrough: { enabled: false, allowedProtocols: [] },
    }))
    mockNormalizeRequest.mockImplementation(async () => ({
      model: 'claude-3',
      messages: [],
      stream: false,
    }))
    mockAdaptRequest.mockImplementation(async () => ({
      body: { model: 'gpt-4' },
      headers: { 'content-type': 'application/json' },
      url: 'https://api.openai.com/v1/chat',
    }))
    mockGetTransformer.mockImplementation(() => ({
      normalizeRequest: mockNormalizeRequest,
      adaptRequest: mockAdaptRequest,
    }))
    mockRouteCandidates.mockImplementation(async () => [createMockCandidate()])
    mockGetProviderUrl.mockImplementation(() => 'https://api.anthropic.com')
    mockGetProviderProtocol.mockImplementation(() => 'anthropic')
    mockExecuteFailoverIteration.mockImplementation(async () => ({
      type: 'success',
      response: new Response('{}', { status: 200 }),
      retryCount: 0,
    }))
    mockHandleNonStreamingResponse.mockImplementation(
      async () => new Response('{}', { status: 200 }),
    )
    mockHandleStreamingResponse.mockImplementation(
      async () => new Response('stream', { status: 200 }),
    )
    mockHandleGatewayError.mockImplementation(
      async () => new Response('gateway error', { status: 500 }),
    )
  })

  afterAll(async () => {
    mock.restore()
    const realConfig = await import('../../../config')
    const realLogger = await import('../../../lib/logger')
    const realAccessModelRouter = await import('../../services/access-model-router')
    const realClientIdentifier = await import('../../services/client-identifier')
    const realErrorHandler = await import('../../services/error-handler')
    const realLogEventBus = await import('../../services/log-event-bus')
    const realModelGroupRouter = await import('../../services/model-group-router')
    const realProtocolDetector = await import('../../services/protocol-detector')
    const realResponseHandlers = await import('../../services/response-handlers')
    const realTransformer = await import('../../transformer')
    const realAbortManager = await import('../shared/abort-manager')
    const realFailoverExecutor = await import('../shared/failover-executor')
    const realMessagesExecutor = await import('./messages-executor')
    mock.module('../../../config', () => realConfig)
    mock.module('../../../lib/logger', () => realLogger)
    mock.module('../../services/access-model-router', () => realAccessModelRouter)
    mock.module('../../services/client-identifier', () => realClientIdentifier)
    mock.module('../../services/error-handler', () => realErrorHandler)
    mock.module('../../services/log-event-bus', () => realLogEventBus)
    mock.module('../../services/model-group-router', () => realModelGroupRouter)
    mock.module('../../services/protocol-detector', () => realProtocolDetector)
    mock.module('../../services/response-handlers', () => realResponseHandlers)
    mock.module('../../transformer', () => realTransformer)
    mock.module('../shared/abort-manager', () => realAbortManager)
    mock.module('../shared/failover-executor', () => realFailoverExecutor)
    mock.module('./messages-executor', () => realMessagesExecutor)
  })

  // Test 1
  it('returns 403 when virtualKey.allowedModels does not include requested model', async () => {
    const virtualKey = createTestVirtualKey({ allowedModels: ['claude-3-haiku'] })
    const c = createMockContext({
      virtualKey,
      preprocessedBody: { model: 'claude-3-sonnet' },
    })

    mockNormalizeRequest.mockImplementation(async () => ({
      model: 'claude-3-sonnet',
      messages: [],
      stream: false,
    }))

    const response = await handleAnthropicMessages(c, false, { model: 'claude-3-sonnet' })
    expect(response.status).toBe(403)

    const body = await response.json()
    expect(body).toEqual({
      type: 'error',
      error: {
        type: 'permission_error',
        message: 'Your API key does not have permission to use this model',
      },
    })
  })

  // Test 2
  it('throws ModelNotFoundError when no candidates found', async () => {
    mockRouteCandidates.mockImplementation(async () => [])

    const c = createMockContext()
    await handleAnthropicMessages(c, false)

    expect(mockHandleGatewayError).toHaveBeenCalled()
    const calls = getMockCalls(mockHandleGatewayError)
    expect((calls[0][0] as { error: Error }).error).toBeInstanceOf(MockModelNotFoundError)
  })

  // Test 3
  it('catches error when no transformer found and calls handleGatewayError', async () => {
    mockGetTransformer.mockImplementation(
      () => null as unknown as ReturnType<typeof mockGetTransformer>,
    )

    const c = createMockContext()
    await handleAnthropicMessages(c, false)

    expect(mockHandleGatewayError).toHaveBeenCalled()
  })

  // Test 4
  it('dispatches to handleStreamingResponse when stream=true', async () => {
    mockNormalizeRequest.mockImplementation(async () => ({
      model: 'claude-3',
      messages: [],
      stream: true,
    }))

    const c = createMockContext()
    await handleAnthropicMessages(c, true)

    expect(mockHandleStreamingResponse).toHaveBeenCalled()
    expect(mockHandleNonStreamingResponse).not.toHaveBeenCalled()
  })

  // Test 5
  it('dispatches to handleNonStreamingResponse when stream=false', async () => {
    mockNormalizeRequest.mockImplementation(async () => ({
      model: 'claude-3',
      messages: [],
      stream: false,
    }))

    const c = createMockContext()
    await handleAnthropicMessages(c, false)

    expect(mockHandleNonStreamingResponse).toHaveBeenCalled()
    expect(mockHandleStreamingResponse).not.toHaveBeenCalled()
  })

  // Test 6
  it('throws error when all candidates exhausted', async () => {
    mockRouteCandidates.mockImplementation(async () => [
      createMockCandidate('claude-3-sonnet'),
      createMockCandidate('claude-3-haiku'),
    ])
    mockExecuteFailoverIteration.mockImplementation(async () => ({
      type: 'failover',
      response: new Response('error', { status: 500 }),
      retryCount: 0,
    }))

    const c = createMockContext()
    await handleAnthropicMessages(c, false)

    expect(mockHandleGatewayError).toHaveBeenCalled()
    const calls = getMockCalls(mockHandleGatewayError)
    expect((calls[0][0] as { error: { message: string } }).error.message).toBe(
      'All candidate instances exhausted',
    )
  })

  // Test 7
  it('returns 400 with Anthropic error shape when provider URL missing on last candidate', async () => {
    mockRouteCandidates.mockImplementation(async () => [createMockCandidate()])
    mockGetProviderUrl.mockImplementation(() => undefined)

    const c = createMockContext()
    const response = await handleAnthropicMessages(c, false)

    expect(response.status).toBe(400)
    const body = (await response.json()) as Record<string, unknown>
    expect(body).toHaveProperty('type', 'error')
    expect(body.error).toHaveProperty('type', 'protocol_error')
    expect((body.error as Record<string, unknown>).message).toContain('Protocol')
  })

  // Test 8
  it('continues to next candidate when provider URL missing on non-last candidate', async () => {
    const candidates = [
      createMockCandidate('claude-3-sonnet'),
      createMockCandidate('claude-3-haiku'),
    ]
    mockRouteCandidates.mockImplementation(async () => candidates)

    let callCount = 0
    mockGetProviderUrl.mockImplementation(() => {
      callCount++
      if (callCount === 1) return undefined
      return 'https://api.anthropic.com'
    })

    mockExecuteFailoverIteration.mockImplementation(async () => ({
      type: 'success',
      response: new Response('{}', { status: 200 }),
      retryCount: 0,
    }))

    const c = createMockContext()
    await handleAnthropicMessages(c, false)

    // executeFailoverIteration should only be called once (for the second candidate)
    const calls = getMockCalls(mockExecuteFailoverIteration)
    expect(calls.length).toBe(1)
  })

  // Test 9
  it('fails over to next candidate when first fails', async () => {
    const candidates = [
      createMockCandidate('claude-3-sonnet'),
      createMockCandidate('claude-3-haiku'),
    ]
    mockRouteCandidates.mockImplementation(async () => candidates)

    let callCount = 0
    mockExecuteFailoverIteration.mockImplementation(async () => {
      callCount++
      if (callCount === 1) {
        return { type: 'failover', response: new Response('error', { status: 429 }), retryCount: 0 }
      }
      return { type: 'success', response: new Response('{}', { status: 200 }), retryCount: 0 }
    })

    const c = createMockContext()
    await handleAnthropicMessages(c, false)

    const calls = getMockCalls(mockExecuteFailoverIteration)
    expect(calls.length).toBe(2)
    expect(mockHandleNonStreamingResponse).toHaveBeenCalled()
  })

  // Test 10
  it('returns error responses with Anthropic format including type wrapper', async () => {
    // Test 403 error
    const virtualKey = createTestVirtualKey({ allowedModels: ['claude-3-haiku'] })
    const c1 = createMockContext({
      virtualKey,
      preprocessedBody: { model: 'claude-3-sonnet' },
    })
    mockNormalizeRequest.mockImplementation(async () => ({
      model: 'claude-3-sonnet',
      messages: [],
      stream: false,
    }))

    const response1 = await handleAnthropicMessages(c1, false, { model: 'claude-3-sonnet' })
    const body1 = (await response1.json()) as Record<string, unknown>
    expect(body1).toHaveProperty('type', 'error')
    expect(body1.error).toHaveProperty('type', 'permission_error')

    // Test 400 error (provider URL missing)
    mockRouteCandidates.mockImplementation(async () => [createMockCandidate()])
    mockGetProviderUrl.mockImplementation(() => undefined)

    const c2 = createMockContext()
    const response2 = await handleAnthropicMessages(c2, false)
    const body2 = (await response2.json()) as Record<string, unknown>
    expect(body2).toHaveProperty('type', 'error')
    expect(body2.error).toHaveProperty('type', 'protocol_error')
  })

  // Test 11
  it('uses default retryable status codes without 521', async () => {
    const c = createMockContext()
    await handleAnthropicMessages(c, false)

    const calls = getMockCalls(mockExecuteFailoverIteration)
    const params = calls[0][0] as {
      retryConfig: { retryableStatusCodes: number[] }
    }
    expect(params.retryConfig.retryableStatusCodes).toEqual([429, 500, 502, 503, 524])
    expect(params.retryConfig.retryableStatusCodes).not.toContain(521)
  })

  // Test 12
  it('returns abort via handleGatewayError when result type is abort', async () => {
    mockExecuteFailoverIteration.mockImplementation(async () => ({
      type: 'abort',
      response: new Response('aborted', { status: 499 }),
      retryCount: 0,
    }))

    const c = createMockContext()
    await handleAnthropicMessages(c, false)

    expect(mockHandleGatewayError).toHaveBeenCalled()
  })

  // Test 13
  it('returns error response directly when result type is error', async () => {
    const errorResponse = new Response('provider error', { status: 500 })
    mockExecuteFailoverIteration.mockImplementation(async () => ({
      type: 'error',
      response: errorResponse,
      retryCount: 0,
    }))

    const c = createMockContext()
    const response = await handleAnthropicMessages(c, false)

    expect(response).toBe(errorResponse)
  })
})
