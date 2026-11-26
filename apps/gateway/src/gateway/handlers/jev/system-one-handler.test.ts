import { describe, it, expect, mock, afterAll, beforeEach } from 'bun:test'
import type { Context } from 'hono'

const mockLogger = {
  info: mock(() => {}),
  debug: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  child: mock(() => mockLogger),
}

mock.module('../../../lib/logger', () => ({ default: mockLogger }))

const mockRouteCandidates = mock(async () => [])

mock.module('../../services/access-model-router', () => ({
  accessModelRouter: { routeCandidates: mockRouteCandidates },
}))

mock.module('../../services/client-identifier', () => ({
  identifyClient: mock(() => ({ type: 'unknown', name: 'unknown' })),
  resolveClientIp: mock(() => '127.0.0.1'),
}))

mock.module('../../services/error-handler', () => ({
  handleGatewayError: mock(async () => new Response('gateway error', { status: 500 })),
}))

mock.module('../../services/model-group-router', () => ({
  ModelNotFoundError: class ModelNotFoundError extends Error {},
  FAILOVER_STATUS_CODES: new Set([429, 500, 502, 503, 504, 521, 524]),
}))

mock.module('../../services/protocol-detector', () => ({
  getProviderUrl: mock(() => 'https://jev.example'),
}))

const mockExecuteFailoverIteration = mock(async () => ({
  type: 'success' as const,
  response: new Response('{"answers":{}}', {
    status: 200,
    headers: { 'content-type': 'application/json' },
  }),
  retryCount: 0,
}))

mock.module('../shared/failover-executor', () => ({
  executeFailoverIteration: mockExecuteFailoverIteration,
}))

mock.module('../../services/response-handlers', () => ({
  handleNonStreamingResponse: mock(
    async (params: { response?: Response }) =>
      params.response ?? new Response('{"answers":{}}', { status: 200 }),
  ),
}))

mock.module('../../transformer', () => ({
  createTransformerContext: mock(() => ({ requestId: 'test', state: new Map() })),
}))

import { handleJevSystemOne } from './system-one-handler'
import {
  createTestVirtualKey,
  createTestProvider,
  createTestModelGroup,
  createTestModelInstance,
} from '../../../test/factories'

function createCandidate(instanceConfig?: Record<string, unknown>) {
  const provider = createTestProvider({
    protocols: { jev: { enabled: true, baseUrl: 'https://jev.example' } },
  })
  const instance = createTestModelInstance({
    id: 'jev-inst-0',
    actualModelName: 'jev-latest',
    ...(instanceConfig ? { config: instanceConfig } : {}),
  })
  return {
    instance,
    provider,
    group: createTestModelGroup({ category: 'system_one' }),
    decision: { strategy: 'priority', reason: 'test', candidates: 1 },
    mapping: {
      modelName: 'jev-latest',
      originalModel: 'jev-router',
      mappingType: 'identity',
      isMapped: true,
    },
    matchedRule: undefined,
  }
}

function createMockContext(body: Record<string, unknown>) {
  const headers = new Headers({ 'content-type': 'application/json' })
  const variables = new Map<string, unknown>([
    ['virtualKey', createTestVirtualKey({ allowedModels: ['jev-router'] })],
    ['requestId', 'jev-req-1'],
  ])
  return {
    req: {
      path: '/api/v1/systemone',
      method: 'POST',
      header: (name: string) => headers.get(name) || undefined,
      raw: { headers, signal: new AbortController().signal },
      json: async () => body,
    },
    get: (key: string) => variables.get(key),
    set: (key: string, value: unknown) => variables.set(key, value),
    header: () => undefined,
    json: (b: unknown, status?: number) => new Response(JSON.stringify(b), { status }),
  } as unknown as Context
}

describe('handleJevSystemOne instance configuration', () => {
  beforeEach(() => {
    mockRouteCandidates.mockClear()
    mockExecuteFailoverIteration.mockClear()
  })

  afterAll(() => {
    mock.restore()
  })

  it('forwards the instance timeoutConfig to the failover executor', async () => {
    const candidate = createCandidate({
      timeoutConfig: { connectTimeoutMs: 1234, ttfbTimeoutMs: 5678 },
    })
    mockRouteCandidates.mockResolvedValueOnce([candidate])

    await handleJevSystemOne(createMockContext({ model: 'jev-router', state: 's', questions: {} }))

    const params = mockExecuteFailoverIteration.mock.calls[0]?.[0] as unknown as {
      instanceTimeoutConfig?: { connectTimeoutMs?: number; ttfbTimeoutMs?: number } | null
    }
    expect(params.instanceTimeoutConfig).toEqual({ connectTimeoutMs: 1234, ttfbTimeoutMs: 5678 })
  })

  it('passes null when the instance has no timeoutConfig', async () => {
    mockRouteCandidates.mockResolvedValueOnce([createCandidate()])

    await handleJevSystemOne(createMockContext({ model: 'jev-router', state: 's', questions: {} }))

    const params = mockExecuteFailoverIteration.mock.calls[0]?.[0] as unknown as {
      instanceTimeoutConfig?: unknown
    }
    expect(params.instanceTimeoutConfig).toBeNull()
  })
})
