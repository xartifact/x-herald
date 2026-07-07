import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'
import type { Context } from 'hono'
import type { TransformerContext } from '@xartifact/x-llm-gateway-shared'
import {
  createTestProvider,
  createTestModelGroup,
  createTestModelInstance,
  createTestVirtualKey,
} from '../../../test/factories'
import type { AbortManager } from '../shared/abort-manager'

// ---------------------------------------------------------------------------
// Mock modules BEFORE importing the test target
// ---------------------------------------------------------------------------

const mockCircuitBreakerRecordFailure = mock(() => {})
const mockCircuitBreakerRecordSuccess = mock(() => {})
mock.module('../../services/circuit-breaker', () => ({
  circuitBreakerRegistry: {
    recordFailure: mockCircuitBreakerRecordFailure,
    recordSuccess: mockCircuitBreakerRecordSuccess,
  },
}))

const mockHandleGatewayError = mock(async () => new Response('error', { status: 500 }))
const mockHandleProviderError = mock(async () => new Response('error', { status: 500 }))
const mockHandleProviderErrorPassthrough = mock(async () => new Response('error', { status: 500 }))
mock.module('../../services/error-handler', () => ({
  handleGatewayError: mockHandleGatewayError,
  handleProviderError: mockHandleProviderError,
  handleProviderErrorPassthrough: mockHandleProviderErrorPassthrough,
}))

const mockLogStartAsync = mock(() => ({ logId: 'log-1', attemptId: 'attempt-1' }))
const mockMarkLogAsFailed = mock(async () => {})
mock.module('../../services/log-service', () => ({
  logStartAsync: mockLogStartAsync,
  markLogAsFailed: mockMarkLogAsFailed,
}))

const mockLogEventBusEmitLog = mock(() => {})
mock.module('../../services/log-event-bus', () => ({
  logEventBus: { emitLog: mockLogEventBusEmitLog },
}))

const mockGetTransformer = mock(() => ({
  adaptRequest: mock(async () => ({
    body: { model: 'gpt-4' },
    headers: { 'content-type': 'application/json' },
    url: 'https://api.openai.com/v1/chat',
  })),
}))
mock.module('../../transformer', () => ({
  getTransformer: mockGetTransformer,
}))

const mockBuildHeaders = mock((headers: Record<string, string>) => headers)
mock.module('../../transformer/shared/parameter-transformer', () => ({
  buildHeaders: mockBuildHeaders,
}))

const mockNormalizeAnthropicPassthroughMessages = mock(
  (messages: Array<{ role: string; content: unknown }>) => messages,
)
const mockHasAssistantMessagesWithoutThinking = mock(() => false)
const mockInjectSyntheticThinkingBlocks = mock(
  (messages: Array<{ role: string; content: unknown }>) => messages,
)
mock.module('./thinking-validator', () => ({
  normalizeAnthropicPassthroughMessages: mockNormalizeAnthropicPassthroughMessages,
  hasAssistantMessagesWithoutThinking: mockHasAssistantMessagesWithoutThinking,
  injectSyntheticThinkingBlocks: mockInjectSyntheticThinkingBlocks,
}))

mock.module('../../services/headers', () => ({
  shouldFilterHeader: () => false,
}))

mock.module('../../services/protocol-detector', () => ({
  getEndpoint: (protocol: string, streaming: boolean) => '/v1/messages',
}))

mock.module('../shared/join-url', () => ({
  joinUrl: (base: string, path: string) => base + path,
}))

// ---------------------------------------------------------------------------
// Import test target AFTER all mocks
// ---------------------------------------------------------------------------
const { AnthropicMessagesExecutor } = await import('./messages-executor?v=1')

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createExecutorConfig(
  overrides: Partial<import('./messages-executor').AnthropicExecutorConfig> & {
    isStreaming?: boolean
    isPassthroughEnabled?: boolean
  } = {},
): import('./messages-executor').AnthropicExecutorConfig {
  const { isStreaming, ...restOverrides } = overrides
  const instance = createTestModelInstance({ actualModelName: 'claude-3-sonnet' })
  const provider = createTestProvider({
    apiKey: 'sk-test-provider',
    protocols: {
      anthropic: {
        baseUrl: 'https://api.anthropic.com',
        enabled: true,
      },
    },
  })
  const group = createTestModelGroup()
  const standardReq = { model: 'claude-3', messages: [], stream: false }

  return {
    requestGroupId: 'group-1',
    candidateIndex: 0,
    c: {} as unknown as Context,
    ctx: {
      provider: {},
      instanceConfig: {},
    } as unknown as TransformerContext,
    candidate: {
      instance,
      provider,
      group,
      matchedRule: { id: 'rule-1', name: 'Test Rule', priority: 1 },
      mapping: {
        originalModel: 'claude-3',
        modelName: 'claude-3',
        mappingType: 'exact',
        isMapped: false,
      },
      decision: { strategy: 'priority' },
    },
    req: {
      rawBody: { model: 'claude-3' },
      standardReq,
      standardRequestBody: standardReq,
      virtualKey: createTestVirtualKey(),
      clientRequestHeaders: {},
      clientIp: '127.0.0.1',
      userAgent: 'test-agent',
      clientType: 'unknown',
      requestPath: '/v1/messages',
      requestMethod: 'POST',
      conversationId: 'conv-1',
      isStreaming: false,
      incomingProtocol: 'anthropic',
      startTime: Date.now(),
      requestId: 'test-req-1',
    },
    abortManager: {
      setLogId: mock(() => {}),
    } as unknown as AbortManager,
    providerUrl: 'https://api.anthropic.com',
    isPassthroughEnabled: false,
    targetProtocol: 'anthropic',
    retryCount: 0,
    ...restOverrides,
    ...(isStreaming !== undefined
      ? {
          req: {
            rawBody: { model: 'claude-3' },
            standardReq: { model: 'claude-3', messages: [] },
            standardRequestBody: { model: 'claude-3', messages: [] },
            virtualKey: createTestVirtualKey(),
            clientRequestHeaders: {},
            clientIp: '127.0.0.1',
            userAgent: 'test-agent',
            clientType: 'unknown',
            requestPath: '/v1/messages',
            requestMethod: 'POST',
            conversationId: 'conv-1',
            isStreaming,
            incomingProtocol: 'anthropic' as const,
            startTime: Date.now(),
            requestId: 'test-req-1',
          },
        }
      : {}),
  }
}

function getMockCalls(fn: unknown): unknown[][] {
  return (fn as unknown as { mock: { calls: unknown[][] } }).mock.calls
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AnthropicMessagesExecutor', () => {
  beforeEach(() => {
    mock.restore()
    mockLogEventBusEmitLog.mockClear()
    mockLogEventBusEmitLog.mockImplementation(() => {})
    mockHandleProviderError.mockClear()
    mockHandleProviderError.mockImplementation(async () => new Response('error', { status: 500 }))
    mockHandleProviderErrorPassthrough.mockClear()
    mockHandleProviderErrorPassthrough.mockImplementation(
      async () => new Response('error', { status: 500 }),
    )
    mockHandleGatewayError.mockClear()
    mockHandleGatewayError.mockImplementation(async () => new Response('error', { status: 500 }))
    mockCircuitBreakerRecordFailure.mockClear()
    mockCircuitBreakerRecordFailure.mockImplementation(() => {})
    mockCircuitBreakerRecordSuccess.mockClear()
    mockCircuitBreakerRecordSuccess.mockImplementation(() => {})
    mockLogStartAsync.mockClear()
    mockLogStartAsync.mockImplementation(() => ({ logId: 'log-1', attemptId: 'attempt-1' }))
    mockMarkLogAsFailed.mockClear()
    mockMarkLogAsFailed.mockImplementation(async () => {})

    mockNormalizeAnthropicPassthroughMessages.mockImplementation(
      (messages: Array<{ role: string; content: unknown }>) => messages,
    )
    mockHasAssistantMessagesWithoutThinking.mockImplementation(() => false)
    mockInjectSyntheticThinkingBlocks.mockImplementation(
      (messages: Array<{ role: string; content: unknown }>) => messages,
    )
    mockGetTransformer.mockImplementation(() => ({
      adaptRequest: mock(async () => ({
        body: { model: 'gpt-4' },
        headers: { 'content-type': 'application/json' },
        url: 'https://api.openai.com/v1/chat',
      })),
    }))
    mockLogStartAsync.mockImplementation(() => ({ logId: 'log-1', attemptId: 'attempt-1' }))
  })

  afterAll(async () => {
    mock.restore()
    const realLogger = await import('../../../lib/logger')
    const realCircuitBreaker = await import('../../services/circuit-breaker')
    const realErrorHandler = await import('../../services/error-handler')
    const realLogService = await import('../../services/log-service')
    const realLogEventBus = await import('../../services/log-event-bus')
    const realTransformer = await import('../../transformer')
    const realParameterTransformer = await import('../../transformer/shared/parameter-transformer')
    const realHeaders = await import('../../services/headers')
    const realProtocolDetector = await import('../../services/protocol-detector')
    const realJoinUrl = await import('../shared/join-url')
    const realThinkingValidator = await import('./thinking-validator')
    mock.module('../../../lib/logger', () => realLogger)
    mock.module('../../services/circuit-breaker', () => realCircuitBreaker)
    mock.module('../../services/error-handler', () => realErrorHandler)
    mock.module('../../services/log-service', () => realLogService)
    mock.module('../../services/log-event-bus', () => realLogEventBus)
    mock.module('../../transformer', () => realTransformer)
    mock.module('../../transformer/shared/parameter-transformer', () => realParameterTransformer)
    mock.module('../../services/headers', () => realHeaders)
    mock.module('../../services/protocol-detector', () => realProtocolDetector)
    mock.module('../shared/join-url', () => realJoinUrl)
    mock.module('./thinking-validator', () => realThinkingValidator)
  })

  describe('prepareRequest', () => {
    it('with passthrough passes rawBody with model name changed and normalizes messages', async () => {
      const rawBody = {
        model: 'claude-3',
        messages: [{ role: 'user', content: [{ type: 'text', text: 'hello' }] }],
      }
      const standardReq = { model: 'claude-3', messages: [] }

      const config = createExecutorConfig({
        isPassthroughEnabled: true,
        req: {
          rawBody,
          standardReq,
          standardRequestBody: standardReq,
          virtualKey: createTestVirtualKey(),
          clientRequestHeaders: {},
          clientIp: '127.0.0.1',
          userAgent: 'test-agent',
          clientType: 'unknown',
          requestPath: '/v1/messages',
          requestMethod: 'POST',
          conversationId: 'conv-1',
          isStreaming: false,
          incomingProtocol: 'anthropic',
          startTime: Date.now(),
          requestId: 'test-req-1',
        },
      })

      const executor = new AnthropicMessagesExecutor(config)
      const result = await executor.prepareRequest()

      expect(mockNormalizeAnthropicPassthroughMessages).toHaveBeenCalled()
      const body = JSON.parse(result.body!)
      expect(body).toHaveProperty('model', 'claude-3-sonnet')
    })

    it('with passthrough and thinking support injects synthetic thinking blocks', async () => {
      const rawBody = {
        model: 'claude-3',
        messages: [{ role: 'assistant', content: [{ type: 'text', text: 'hello' }] }],
      }
      const standardReq = { model: 'claude-3', messages: [] }

      const instance = createTestModelInstance({ actualModelName: 'claude-3-7-sonnet' })
      const provider = createTestProvider({
        apiKey: 'sk-test-provider',
        protocols: {
          anthropic: {
            baseUrl: 'https://api.anthropic.com',
            enabled: true,
          },
        },
      })

      const config = createExecutorConfig({
        isPassthroughEnabled: true,
        candidate: {
          instance,
          provider,
          group: createTestModelGroup(),
          matchedRule: { id: 'rule-1', name: 'Test Rule', priority: 1 },
          mapping: {
            originalModel: 'claude-3',
            modelName: 'claude-3',
            mappingType: 'exact',
            isMapped: false,
          },
          decision: { strategy: 'priority' },
        },
        req: {
          rawBody,
          standardReq,
          standardRequestBody: standardReq,
          virtualKey: createTestVirtualKey(),
          clientRequestHeaders: {},
          clientIp: '127.0.0.1',
          userAgent: 'test-agent',
          clientType: 'unknown',
          requestPath: '/v1/messages',
          requestMethod: 'POST',
          conversationId: 'conv-1',
          isStreaming: false,
          incomingProtocol: 'anthropic',
          startTime: Date.now(),
          requestId: 'test-req-1',
        },
      })

      mockHasAssistantMessagesWithoutThinking.mockImplementation(() => true)

      const executor = new AnthropicMessagesExecutor(config)
      await executor.prepareRequest()

      expect(mockHasAssistantMessagesWithoutThinking).toHaveBeenCalled()
      expect(mockInjectSyntheticThinkingBlocks).toHaveBeenCalled()
    })

    it('with transform calls egressTransformer.adaptRequest', async () => {
      const mockAdaptRequest = mock(async () => ({
        body: { model: 'gpt-4' },
        headers: { 'content-type': 'application/json' },
        url: 'https://api.openai.com/v1/chat',
      }))
      mockGetTransformer.mockImplementation(() => ({ adaptRequest: mockAdaptRequest }))

      const standardReq = { model: 'claude-3', messages: [] }
      const config = createExecutorConfig({
        isPassthroughEnabled: false,
        targetProtocol: 'openai',
        req: {
          rawBody: { model: 'claude-3' },
          standardReq,
          standardRequestBody: standardReq,
          virtualKey: createTestVirtualKey(),
          clientRequestHeaders: {},
          clientIp: '127.0.0.1',
          userAgent: 'test-agent',
          clientType: 'unknown',
          requestPath: '/v1/messages',
          requestMethod: 'POST',
          conversationId: 'conv-1',
          isStreaming: false,
          incomingProtocol: 'anthropic',
          startTime: Date.now(),
          requestId: 'test-req-1',
        },
      })

      const executor = new AnthropicMessagesExecutor(config)
      await executor.prepareRequest()

      expect(mockGetTransformer).toHaveBeenCalledWith('openai')
      expect(mockAdaptRequest).toHaveBeenCalled()
    })

    it('auth header is x-api-key when targetProtocol is anthropic on passthrough', async () => {
      const config = createExecutorConfig({
        isPassthroughEnabled: true,
        targetProtocol: 'anthropic',
      })

      const executor = new AnthropicMessagesExecutor(config)
      const result = await executor.prepareRequest()

      expect(result.headers).toHaveProperty('x-api-key', 'sk-test-provider')
    })

    it('auth header is authorization: Bearer when targetProtocol is openai on transform', async () => {
      const mockAdaptRequest = mock(async () => ({
        body: { model: 'gpt-4' },
        headers: { 'content-type': 'application/json' },
        url: 'https://api.openai.com/v1/chat',
      }))
      mockGetTransformer.mockImplementation(() => ({ adaptRequest: mockAdaptRequest }))

      const config = createExecutorConfig({
        isPassthroughEnabled: false,
        targetProtocol: 'openai',
      })

      const executor = new AnthropicMessagesExecutor(config)
      const result = await executor.prepareRequest()

      expect(result.headers).toHaveProperty('authorization', 'Bearer sk-test-provider')
    })
  })

  describe('beforeFetch', () => {
    it('emits waiting event for streaming', async () => {
      const config = createExecutorConfig({ isStreaming: true })
      const executor = new AnthropicMessagesExecutor(config)
      executor.logId = 'log-1'

      executor.beforeFetch()

      expect(mockLogEventBusEmitLog).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'waiting',
          logId: 'log-1',
        }),
      )
    })

    it('does not emit waiting event when not streaming', async () => {
      const config = createExecutorConfig({ isStreaming: false })
      const executor = new AnthropicMessagesExecutor(config)
      executor.logId = 'log-1'

      executor.beforeFetch()

      expect(mockLogEventBusEmitLog).not.toHaveBeenCalled()
    })
  })

  describe('retry', () => {
    it('calls circuitBreakerRegistry.recordFailure', async () => {
      const config = createExecutorConfig()
      const executor = new AnthropicMessagesExecutor(config)

      executor.retry(1, 100, new Response('error', { status: 429 }))

      expect(mockCircuitBreakerRecordFailure).toHaveBeenCalled()
    })
  })

  describe('recordSuccess', () => {
    it('calls circuitBreakerRegistry.recordSuccess', async () => {
      const config = createExecutorConfig()
      const executor = new AnthropicMessagesExecutor(config)

      executor.recordSuccess()

      expect(mockCircuitBreakerRecordSuccess).toHaveBeenCalled()
    })
  })

  describe('markLogFailed', () => {
    it('calls markLogAsFailed', async () => {
      const config = createExecutorConfig()
      const executor = new AnthropicMessagesExecutor(config)

      await executor.markLogFailed({
        logId: 'log-1',
        attemptId: 'attempt-1',
        statusCode: 500,
        errorMessage: 'Test error',
        retryCount: 0,
        responseTimeMs: 1000,
      })

      expect(mockMarkLogAsFailed).toHaveBeenCalled()
    })
  })

  describe('emitAbortedEvent', () => {
    it('emits aborted event on logEventBus', async () => {
      const config = createExecutorConfig()
      const executor = new AnthropicMessagesExecutor(config)

      executor.emitAbortedEvent('log-1')

      expect(mockLogEventBusEmitLog).toHaveBeenCalledWith({
        event: 'aborted',
        logId: 'log-1',
      })
    })
  })

  describe('gatewayError', () => {
    it('calls handleGatewayError with correct parameters', async () => {
      const config = createExecutorConfig()
      const executor = new AnthropicMessagesExecutor(config)
      executor.logId = 'log-1'

      await executor.gatewayError('test_error', 'Test error message')

      expect(mockHandleGatewayError).toHaveBeenCalled()
      const calls = getMockCalls(mockHandleGatewayError)
      expect(calls[0][0]).toMatchObject(
        expect.objectContaining({
          error: expect.any(Error),
          c: config.c,
          virtualKey: config.req.virtualKey,
        }),
      )
    })
  })

  describe('providerError', () => {
    it('calls handleProviderError when passthrough disabled', async () => {
      const config = createExecutorConfig({ isPassthroughEnabled: false })
      const executor = new AnthropicMessagesExecutor(config)
      executor.logId = 'log-1'
      executor.attemptId = 'attempt-1'

      const response = new Response('error', { status: 400 })
      await executor.providerError(response, {})

      expect(mockHandleProviderError).toHaveBeenCalled()
      expect(mockHandleProviderErrorPassthrough).not.toHaveBeenCalled()
    })

    it('calls handleProviderErrorPassthrough when passthrough enabled', async () => {
      const config = createExecutorConfig({ isPassthroughEnabled: true })
      const executor = new AnthropicMessagesExecutor(config)
      executor.logId = 'log-1'
      executor.attemptId = 'attempt-1'

      const response = new Response('error', { status: 400 })
      await executor.providerError(response, {})

      expect(mockHandleProviderErrorPassthrough).toHaveBeenCalled()
      expect(mockHandleProviderError).not.toHaveBeenCalled()
    })
  })
})
