import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'
import type { Context } from 'hono'

const realLogger = await import('../../../lib/logger')
const realCircuitBreaker = await import('../../services/circuit-breaker')
const realErrorHandler = await import('../../services/error-handler')
const realLogService = await import('../../services/log-service')
const realLogEventBus = await import('../../services/log-event-bus')
const realTransformer = await import('../../transformer')
const realParameterTransformer = await import('../../transformer/shared/parameter-transformer')

const mockLogger = {
  info: mock(() => {}),
  debug: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  child: mock(() => mockLogger),
}

mock.module('../../../lib/logger', () => ({
  default: mockLogger,
}))

const mockCircuitBreakerRegistry = {
  recordFailure: mock(() => {}),
  recordSuccess: mock(() => {}),
}

mock.module('../../services/circuit-breaker', () => ({
  circuitBreakerRegistry: mockCircuitBreakerRegistry,
}))

const mockHandleGatewayError = mock(async () => new Response('gateway error', { status: 500 }))
const mockHandleProviderError = mock(async () => new Response('provider error', { status: 500 }))
const mockHandleProviderErrorPassthrough = mock(
  async () => new Response('passthrough error', { status: 500 }),
)

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

const mockLogEventBus = {
  emitLog: mock(() => {}),
}

mock.module('../../services/log-event-bus', () => ({
  logEventBus: mockLogEventBus,
}))

const mockEgressTransformer = {
  adaptRequest: mock(async () => ({
    body: { model: 'gpt-4-turbo', messages: [{ role: 'user', content: 'hello' }] },
    headers: { 'content-type': 'application/json' },
    url: 'https://api.openai.com/v1/chat/completions',
  })),
}

mock.module('../../transformer', () => ({
  getTransformer: mock((protocol: string) => {
    if (protocol === 'openai') {
      return mockEgressTransformer
    }
    return undefined
  }),
}))

const mockBuildHeaders = mock((headers: Record<string, string>) => headers)

mock.module('../../transformer/shared/parameter-transformer', () => ({
  buildHeaders: mockBuildHeaders,
}))

const { ChatCompletionCandidateExecutor } = await import('./chat-completion-executor?v=1')
import type { ExecutorConfig } from './chat-completion-executor'
import type { AbortManager } from '../shared/abort-manager'
import {
  createTestProvider,
  createTestModelGroup,
  createTestModelInstance,
  createTestVirtualKey,
} from '../../../test/factories'

function createMockContext() {
  return {
    req: {
      path: '/v1/chat/completions',
      method: 'POST',
      header: mock(() => undefined),
      raw: {
        headers: new Headers(),
        signal: new AbortController().signal,
      },
      json: mock(async () => ({ model: 'gpt-4', messages: [{ role: 'user', content: 'hello' }] })),
    },
    get: mock(() => undefined),
    json: mock(
      (body: unknown, status?: number) =>
        new Response(JSON.stringify(body), { status: status ?? 200 }),
    ),
  } as unknown as Context
}

const mockAbortManager = {
  isClientDisconnected: false,
  setLogId: mock(() => {}),
  registerClientDisconnect: mock(() => {}),
  createAttempt: mock(() => ({
    controller: new AbortController(),
    cleanup: mock(() => {}),
  })),
  dispose: mock(() => {}),
}

function createBaseExecutorConfig(overrides: Record<string, unknown> = {}): ExecutorConfig {
  const instance = createTestModelInstance(overrides.instance as Record<string, unknown>)
  const provider = createTestProvider(overrides.provider as Record<string, unknown>)
  const group = createTestModelGroup(overrides.group as Record<string, unknown>)
  const virtualKey = createTestVirtualKey(overrides.virtualKey as Record<string, unknown>)

  return {
    c: (overrides.c ?? createMockContext()) as Context,
    ctx: overrides.ctx ?? {
      requestId: 'test-req',
      startTime: Date.now(),
      state: new Map(),
      request: { model: 'gpt-4', messages: [] },
      provider: { name: '', baseUrl: '', apiKey: '', protocol: 'openai', models: [] },
      model: '',
      headers: {},
      metadata: {},
    },
    candidate: {
      instance,
      provider,
      group,
      mapping: overrides.mapping ?? {
        modelName: 'gpt-4',
        isMapped: true,
        originalModel: 'gpt-4',
        mappingType: 'virtual',
      },
      decision: overrides.decision ?? { strategy: 'priority' },
      matchedRule: overrides.matchedRule ?? { id: 'rule-1', name: 'Test Rule', priority: 1 },
    },
    req: {
      rawBody: overrides.rawBody ?? {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }],
      },
      standardReq: overrides.standardReq ?? {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }],
      },
      standardRequestBody: overrides.standardRequestBody ?? {
        model: 'gpt-4',
        messages: [{ role: 'user', content: 'hello' }],
      },
      virtualKey,
      clientRequestHeaders: overrides.clientRequestHeaders ?? {
        'content-type': 'application/json',
      },
      clientIp: overrides.clientIp ?? '127.0.0.1',
      userAgent: overrides.userAgent ?? 'test',
      requestPath: overrides.requestPath ?? '/v1/chat/completions',
      requestMethod: overrides.requestMethod ?? 'POST',
      isStreaming: overrides.isStreaming ?? false,
      incomingProtocol: 'openai',
      startTime: overrides.startTime ?? Date.now(),
      requestId: overrides.requestId ?? 'test-req',
    },
    abortManager: (overrides.abortManager ?? mockAbortManager) as unknown as AbortManager,
    providerUrl: overrides.providerUrl ?? 'https://api.openai.com',
    isPassthroughEnabled: overrides.isPassthroughEnabled ?? true,
    targetProtocol: overrides.targetProtocol ?? 'openai',
    retryCount: overrides.retryCount ?? 0,
    requestGroupId: overrides.requestGroupId ?? 'group-1',
    candidateIndex: overrides.candidateIndex ?? 0,
    routeChain: overrides.routeChain as ExecutorConfig['routeChain'],
  } as ExecutorConfig
}

function getMockCalls(fn: unknown): unknown[][] {
  return (fn as unknown as { mock: { calls: unknown[][] } }).mock.calls
}

describe('ChatCompletionCandidateExecutor', () => {
  beforeEach(() => {
    mock.restore()
    const allMocks = [
      mockLogger.info,
      mockLogger.debug,
      mockLogger.warn,
      mockLogger.error,
      mockCircuitBreakerRegistry.recordFailure,
      mockCircuitBreakerRegistry.recordSuccess,
      mockHandleGatewayError,
      mockHandleProviderError,
      mockHandleProviderErrorPassthrough,
      mockLogStartAsync,
      mockMarkLogAsFailed,
      mockLogEventBus.emitLog,
      mockEgressTransformer.adaptRequest,
      mockBuildHeaders,
    ]
    for (const m of allMocks) {
      const fn = m as unknown as { mockClear: () => void }
      fn.mockClear()
    }
  })

  afterAll(async () => {
    const realLogger = await import('../../../lib/logger')
    const realCircuitBreaker = await import('../../services/circuit-breaker')
    const realErrorHandler = await import('../../services/error-handler')
    const realLogService = await import('../../services/log-service')
    const realLogEventBus = await import('../../services/log-event-bus')
    const realTransformer = await import('../../transformer')
    const realParameterTransformer = await import('../../transformer/shared/parameter-transformer')
    mock.module('../../../lib/logger', () => realLogger)
    mock.module('../../services/circuit-breaker', () => realCircuitBreaker)
    mock.module('../../services/error-handler', () => realErrorHandler)
    mock.module('../../services/log-service', () => realLogService)
    mock.module('../../services/log-event-bus', () => realLogEventBus)
    mock.module('../../transformer', () => realTransformer)
    mock.module('../../transformer/shared/parameter-transformer', () => realParameterTransformer)
  })

  it('prepareRequest() with passthrough passes rawBody through with model name changed', async () => {
    const config = createBaseExecutorConfig({
      isPassthroughEnabled: true,
      instance: { actualModelName: 'gpt-4-turbo' },
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    const result = await executor.prepareRequest()

    expect(result.isPassthroughEnabled).toBe(true)
    expect(result.body).toContain('gpt-4-turbo')
    const parsed = JSON.parse(result.body!)
    expect(parsed.model).toBe('gpt-4-turbo')
    expect(parsed.messages).toEqual([{ role: 'user', content: 'hello' }])
  })

  it('prepareRequest() with transform calls egressTransformer.adaptRequest', async () => {
    const config = createBaseExecutorConfig({
      isPassthroughEnabled: false,
      instance: { actualModelName: 'gpt-4-turbo' },
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    await executor.prepareRequest()

    expect(mockEgressTransformer.adaptRequest).toHaveBeenCalled()
  })

  it('prepareRequest() sets logId, attemptId, transformedBody, providerRequestHeaders', async () => {
    const config = createBaseExecutorConfig({
      isPassthroughEnabled: true,
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    await executor.prepareRequest()

    expect(executor.logId).toBe('log-1')
    expect(executor.attemptId).toBe('attempt-1')
    expect(executor.transformedBody).toBeDefined()
    expect(executor.providerRequestHeaders).toBeDefined()
  })

  it('beforeFetch() sets logId on abortManager', async () => {
    const mockSetLogId = mock(() => {})
    const abortManager = { ...mockAbortManager, setLogId: mockSetLogId }
    const config = createBaseExecutorConfig({
      abortManager,
      isPassthroughEnabled: true,
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    await executor.prepareRequest()
    executor.beforeFetch()

    expect(mockSetLogId).toHaveBeenCalledWith('log-1')
  })

  it('beforeFetch() emits waiting event for streaming requests', async () => {
    const mockSetLogId = mock(() => {})
    const abortManager = { ...mockAbortManager, setLogId: mockSetLogId }
    const config = createBaseExecutorConfig({
      abortManager,
      isStreaming: true,
      isPassthroughEnabled: true,
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    await executor.prepareRequest()
    executor.beforeFetch()

    expect(mockLogEventBus.emitLog).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'waiting' }),
    )
  })

  it('retry() calls circuitBreakerRegistry.recordFailure', () => {
    const instance = createTestModelInstance({ id: 'inst-1' })
    const config = createBaseExecutorConfig({
      instance,
      isPassthroughEnabled: true,
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    executor.retry(1, 500, new Response('error', { status: 429 }))

    expect(mockCircuitBreakerRegistry.recordFailure).toHaveBeenCalledWith(
      instance.id,
      expect.objectContaining({
        instanceName: instance.name,
        groupName: config.candidate.group.name,
        providerName: config.candidate.provider.name,
      }),
    )
  })

  it('recordSuccess() calls circuitBreakerRegistry.recordSuccess', () => {
    const instance = createTestModelInstance({ id: 'inst-1' })
    const config = createBaseExecutorConfig({
      instance,
      isPassthroughEnabled: true,
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    executor.recordSuccess()

    expect(mockCircuitBreakerRegistry.recordSuccess).toHaveBeenCalledWith(
      instance.id,
      expect.objectContaining({
        instanceName: instance.name,
        groupName: config.candidate.group.name,
        providerName: config.candidate.provider.name,
      }),
    )
  })

  it('gatewayError() calls handleGatewayError with correct params', async () => {
    const config = createBaseExecutorConfig({
      isPassthroughEnabled: true,
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    await executor.prepareRequest()
    const result = await executor.gatewayError('test_error', 'Test error message')

    expect(mockHandleGatewayError).toHaveBeenCalled()
    const calls = getMockCalls(mockHandleGatewayError)
    const params = calls[0][0] as Record<string, unknown>
    expect(params.error).toBeInstanceOf(Error)
    expect(params.c).toBe(config.c)
    expect(params.virtualKey).toBe(config.req.virtualKey)
    expect(params.providerRequestHeaders).toEqual(executor.providerRequestHeaders)
    expect(params.rawBody).toEqual(config.req.rawBody)
    expect(params.logId).toBe('log-1')
    expect(params.retryCount).toBe(0)
    expect(result.status).toBe(500)
  })

  it('providerError() passes routingTrace (routeChain) to handleProviderError', async () => {
    const routeChain = {
      requestedModel: 'gpt-4',
      chain: [
        {
          index: 0,
          kind: 'single' as const,
          actionType: 'route_to_group',
          candidates: [
            {
              candidateIndex: 0,
              chainStepIndex: 0,
              chainStepKind: 'single' as const,
              instanceId: 'inst-1',
              instanceName: 'inst-1',
              providerId: 'prov-1',
              providerName: 'prov-1',
              priority: 0,
              strategy: 'priority',
              groupName: 'g1',
            },
          ],
        },
      ],
    }
    const config = createBaseExecutorConfig({
      isPassthroughEnabled: false,
      routeChain,
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    await executor.prepareRequest()
    await executor.providerError(new Response('err', { status: 400 }), {})

    expect(mockHandleProviderError).toHaveBeenCalled()
    const calls = getMockCalls(mockHandleProviderError)
    const params = calls[0][0] as Record<string, unknown>
    expect(params.routingTrace).toBe(routeChain)
  })

  it('providerErrorPassthrough() passes routingTrace (routeChain) to handleProviderErrorPassthrough', async () => {
    const routeChain = {
      requestedModel: 'gpt-4',
      chain: [],
    }
    const config = createBaseExecutorConfig({
      isPassthroughEnabled: true,
      routeChain,
    })
    const executor = new ChatCompletionCandidateExecutor(config)
    await executor.prepareRequest()
    await executor.providerErrorPassthrough(new Response('err', { status: 400 }), {})

    expect(mockHandleProviderErrorPassthrough).toHaveBeenCalled()
    const calls = getMockCalls(mockHandleProviderErrorPassthrough)
    const params = calls[0][0] as Record<string, unknown>
    expect(params.routingTrace).toBe(routeChain)
  })
})
