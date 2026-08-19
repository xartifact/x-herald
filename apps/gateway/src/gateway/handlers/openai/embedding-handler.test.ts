import { describe, it, expect, mock, afterAll, beforeEach } from 'bun:test'
import type { Context } from 'hono'

const realLogger = await import('../../../lib/logger')
const realAccessModelRouter = await import('../../services/access-model-router')
const realClientIdentifier = await import('../../services/client-identifier')
const realErrorHandler = await import('../../services/error-handler')
const realModelGroupRouter = await import('../../services/model-group-router')
const realProtocolDetector = await import('../../services/protocol-detector')
const realFailoverExecutor = await import('../shared/failover-executor')

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

const mockRouteCandidates = mock(async () => [])

mock.module('../../services/access-model-router', () => ({
  accessModelRouter: {
    routeCandidates: mockRouteCandidates,
  },
}))

mock.module('../../services/client-identifier', () => ({
  identifyClient: mock(() => ({ type: 'unknown', name: 'unknown' })),
}))

const mockHandleGatewayError = mock(async () => new Response('gateway error', { status: 500 }))

mock.module('../../services/error-handler', () => ({
  handleGatewayError: mockHandleGatewayError,
}))

mock.module('../../services/model-group-router', () => ({
  ModelNotFoundError: class ModelNotFoundError extends Error {
    constructor(model: string) {
      super(`Model not found: ${model}`)
      this.name = 'ModelNotFoundError'
    }
  },
  FAILOVER_STATUS_CODES: new Set([429, 500, 502, 503, 504, 521, 524]),
}))

const mockGetProviderProtocol = mock(() => 'openai')
const mockGetProviderUrl = mock(() => 'https://api.openai.com')

mock.module('../../services/protocol-detector', () => ({
  getProviderProtocol: mockGetProviderProtocol,
  getProviderUrl: mockGetProviderUrl,
}))

const mockExecuteFailoverIteration = mock(async () => ({
  type: 'success' as const,
  response: new Response('{"object":"list"}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }),
  retryCount: 0,
}))

mock.module('../shared/failover-executor', () => ({
  executeFailoverIteration: mockExecuteFailoverIteration,
}))

import { handleEmbeddingRequest } from './embedding-handler'
import { accessModelRouter } from '../../services/access-model-router'
import { executeFailoverIteration } from '../shared/failover-executor'
import { handleGatewayError } from '../../services/error-handler'
import {
  createTestVirtualKey,
  createTestProvider,
  createTestModelGroup,
  createTestModelInstance,
} from '../../../test/factories'

function createProvider() {
  return createTestProvider({
    protocols: { openai: { enabled: true, baseUrl: 'https://api.openai.com' } },
  })
}

function createEmbeddingCandidates(count = 1) {
  const provider = createProvider()
  const group = createTestModelGroup({ category: 'embedding' })
  return Array.from({ length: count }, (_, i) => {
    const instance = createTestModelInstance({
      id: `embed-inst-${i}`,
      actualModelName: 'jina-embeddings-v5-omni',
    })
    return {
      instance,
      provider,
      group,
      decision: { strategy: 'priority', reason: 'test', candidates: count },
      mapping: {
        modelName: instance.actualModelName,
        originalModel: 'jina-embeddings-v5-omni',
        mappingType: 'identity',
        isMapped: true,
      },
      matchedRule: undefined,
    }
  })
}

function createMockContext(overrides: Record<string, unknown> = {}) {
  const headers = new Headers(
    (overrides.headers as Record<string, string>) ?? { 'content-type': 'application/json' },
  )
  const variables = new Map<string, unknown>([
    [
      'virtualKey',
      overrides.virtualKey ?? createTestVirtualKey({ allowedModels: ['jina-embeddings-v5-omni'] }),
    ],
    ['requestId', overrides.requestId ?? 'embed-req-1'],
  ])

  const c = {
    req: {
      path: '/api/v1/embeddings',
      method: 'POST',
      header: (name: string) => headers.get(name) || undefined,
      raw: {
        headers,
        signal: new AbortController().signal,
      },
      json: async () => overrides.body ?? {},
    },
    get: (key: string) => variables.get(key),
    json: (body: unknown, status?: number) => new Response(JSON.stringify(body), { status }),
  } as unknown as Context

  return c
}

describe('handleEmbeddingRequest', () => {
  beforeEach(() => {
    mockRouteCandidates.mockClear()
    mockExecuteFailoverIteration.mockClear()
  })

  afterAll(() => {
    mock.restore()
  })

  it('routes to embedding group and passthroughs the request', async () => {
    const candidates = createEmbeddingCandidates(1)
    mockRouteCandidates.mockResolvedValueOnce(candidates)
    mockExecuteFailoverIteration.mockResolvedValueOnce({
      type: 'success' as const,
      response: new Response('{"object":"list"}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
      retryCount: 0,
    })

    const c = createMockContext({
      body: { model: 'jina-embeddings-v5-omni', input: 'hello world' },
    })
    const res = await handleEmbeddingRequest(c)

    expect(res.status).toBe(200)
    expect(mockRouteCandidates).toHaveBeenCalled()
    expect(mockExecuteFailoverIteration).toHaveBeenCalled()
  })

  it('rejects a chat-category group with model not found', async () => {
    const provider = createProvider()
    const chatGroup = createTestModelGroup({ category: 'chat' })
    mockRouteCandidates.mockResolvedValueOnce([
      {
        instance: createTestModelInstance({ actualModelName: 'gpt-4' }),
        provider,
        group: chatGroup,
        decision: { strategy: 'priority', reason: 'test', candidates: 1 },
        mapping: {
          modelName: 'gpt-4',
          originalModel: 'gpt-4',
          mappingType: 'identity',
          isMapped: true,
        },
        matchedRule: undefined,
      },
    ])

    const c = createMockContext({ body: { model: 'jina-embeddings-v5-omni', input: 'x' } })
    const res = await handleEmbeddingRequest(c)

    // no embedding-group candidate → handled as model-not-found error (gateway error path)
    expect(mockExecuteFailoverIteration).not.toHaveBeenCalled()
  })

  it('refuses a model not allowed by the virtual key', async () => {
    const c = createMockContext({
      virtualKey: createTestVirtualKey({ allowedModels: ['gpt-4'] }),
      body: { model: 'jina-embeddings-v5-omni', input: 'x' },
    })
    const res = await handleEmbeddingRequest(c)

    expect(res.status).toBe(403)
    expect(mockRouteCandidates).not.toHaveBeenCalled()
  })

  it('returns 400 when model is missing', async () => {
    const c = createMockContext({ body: { input: 'x' } })
    const res = await handleEmbeddingRequest(c)

    expect(res.status).toBe(400)
  })

  it('routes to next candidate on failover', async () => {
    const candidates = createEmbeddingCandidates(2)
    mockRouteCandidates.mockResolvedValueOnce(candidates)
    // first candidate fails → failover, second succeeds
    mockExecuteFailoverIteration
      .mockResolvedValueOnce({ type: 'failover' as const, response: undefined, retryCount: 1 })
      .mockResolvedValueOnce({
        type: 'success' as const,
        response: new Response('{"object":"list"}', {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
        retryCount: 0,
      })

    const c = createMockContext({ body: { model: 'jina-embeddings-v5-omni', input: 'x' } })
    const res = await handleEmbeddingRequest(c)

    expect(res.status).toBe(200)
    expect(mockExecuteFailoverIteration).toHaveBeenCalledTimes(2)
  })
})
