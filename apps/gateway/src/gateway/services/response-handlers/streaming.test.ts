import { beforeEach, afterEach, afterAll, describe, expect, it, mock } from 'bun:test'

import { createTestVirtualKey } from '../../../test/factories'
import type { ResponseHandlerParams } from './params'
const { handleStreamingResponse } = await import('./streaming?v=1')

// ------------------------------------------------------------------
//  Capture real modules before mocking
// ------------------------------------------------------------------
const realTransformer = await import('../../transformer')
const realLogService = await import('../log-service')
const realLogEventBus = await import('../log-event-bus')
const realCostService = await import('../../../features/costs/service')
const realUsageTracker = await import('../../../features/keys/usage-tracker')
const realMetadataExtractor = await import('../metadata-extractor')
const realRateLimitEngine = await import('../rate-limit-engine')

// ------------------------------------------------------------------
//  Mock modules
// ------------------------------------------------------------------
const mockGetTransformer = mock(() => undefined)
const mockUpgradeToStreamLog = mock(() => Promise.resolve())
const mockFinalizeStreamLog = mock(() => Promise.resolve())
const mockMarkStreamFailed = mock(() => Promise.resolve())
const mockMarkStreamAborted = mock(() => Promise.resolve())
const mockEmitLog = mock(() => undefined)
const mockRecordCost = mock(() => Promise.resolve())
const mockTrackKeyUsage = mock(() => Promise.resolve())
const mockExtractMetadata = mock(() => ({}))
const mockRateLimitCheck = mock(() => ({ allowed: true }))

mock.module('../../transformer', () => ({
  getTransformer: mockGetTransformer,
}))

mock.module('../log-service', () => ({
  ...realLogService,
  upgradeToStreamLog: mockUpgradeToStreamLog,
  finalizeStreamLog: mockFinalizeStreamLog,
  markStreamFailed: mockMarkStreamFailed,
  markStreamAborted: mockMarkStreamAborted,
}))

mock.module('../log-event-bus', () => ({
  logEventBus: {
    emitLog: mockEmitLog,
  },
}))

mock.module('../../../features/costs/service', () => ({
  costService: {
    recordCost: mockRecordCost,
  },
}))

mock.module('../../../features/keys/usage-tracker', () => ({
  trackKeyUsage: mockTrackKeyUsage,
}))

mock.module('../metadata-extractor', () => ({
  extractMetadata: mockExtractMetadata,
}))

mock.module('../rate-limit-engine', () => ({
  rateLimitEngine: {
    check: mockRateLimitCheck,
  },
}))

// ------------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------------

function createMockContext() {
  return {
    json: (body: unknown) => new Response(JSON.stringify(body), { status: 200 }),
    header: () => {},
    req: { path: '/v1/chat/completions', method: 'POST' },
  } as unknown as ResponseHandlerParams['c']
}

function createParams(overrides: Partial<ResponseHandlerParams> = {}): ResponseHandlerParams {
  return {
    c: createMockContext(),
    response: new Response(
      'data: {"id":"test","choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n',
      {
        headers: { 'content-type': 'text/event-stream' },
      },
    ),
    ctx: { requestId: 'test-req', state: new Map() } as unknown as ResponseHandlerParams['ctx'],
    incomingProtocol: 'openai',
    targetProtocol: 'openai',
    virtualKey: createTestVirtualKey(),
    provider: { id: 'provider-1', name: 'TestProvider' },
    originalModelName: 'gpt-4',
    startTime: Date.now() - 100,
    preprocessEndTime: Date.now() - 50,
    providerTtfbTime: Date.now() - 10,
    requestHeaders: {},
    rawBody: { model: 'gpt-4', messages: [] },
    clientIp: '127.0.0.1',
    userAgent: 'test-agent',
    requestPath: '/v1/chat/completions',
    requestMethod: 'POST',
    ...overrides,
  }
}

function createSSEStream(events: object[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  return new ReadableStream({
    start(controller) {
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`))
      }
      controller.close()
    },
  })
}

async function consumeStream(response: Response): Promise<string> {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let result = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    result += decoder.decode(value, { stream: true })
  }
  return result
}

// ------------------------------------------------------------------
//  Tests
// ------------------------------------------------------------------

describe('handleStreamingResponse', () => {
  beforeEach(() => {
    mockGetTransformer.mockClear()
    mockUpgradeToStreamLog.mockClear()
    mockFinalizeStreamLog.mockClear()
    mockMarkStreamFailed.mockClear()
    mockMarkStreamAborted.mockClear()
    mockEmitLog.mockClear()
    mockRecordCost.mockClear()
    mockTrackKeyUsage.mockClear()
    mockExtractMetadata.mockClear()
    mockRateLimitCheck.mockClear()
  })

  afterEach(() => {
    mockGetTransformer.mockClear()
    mockUpgradeToStreamLog.mockClear()
    mockFinalizeStreamLog.mockClear()
    mockMarkStreamFailed.mockClear()
    mockMarkStreamAborted.mockClear()
    mockEmitLog.mockClear()
    mockRecordCost.mockClear()
    mockTrackKeyUsage.mockClear()
    mockExtractMetadata.mockClear()
    mockRateLimitCheck.mockClear()
  })

  afterAll(async () => {
    const realTransformer = await import('../../transformer')
    const realLogService = await import('../log-service')
    const realLogEventBus = await import('../log-event-bus')
    const realCostService = await import('../../../features/costs/service')
    const realUsageTracker = await import('../../../features/keys/usage-tracker')
    const realMetadataExtractor = await import('../metadata-extractor')
    const realRateLimitEngine = await import('../rate-limit-engine')
    mock.module('../../transformer', () => realTransformer)
    mock.module('../log-service', () => realLogService)
    mock.module('../log-event-bus', () => realLogEventBus)
    mock.module('../../../features/costs/service', () => realCostService)
    mock.module('../../../features/keys/usage-tracker', () => realUsageTracker)
    mock.module('../metadata-extractor', () => realMetadataExtractor)
    mock.module('../rate-limit-engine', () => realRateLimitEngine)
  })

  /* 1. Same-protocol passthrough → only provider collector used, returns stream */
  it('returns stream with same-protocol passthrough (no transformation)', async () => {
    const events = [
      { id: '1', choices: [{ delta: { content: 'hello' } }] },
      { id: '2', choices: [{ delta: { content: ' world' } }] },
    ]

    const params = createParams({
      incomingProtocol: 'openai',
      targetProtocol: 'openai',
      response: new Response(createSSEStream(events), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    })

    const result = await handleStreamingResponse(params)

    expect(result).toBeInstanceOf(Response)
    expect(result.body).toBeTruthy()

    const text = await consumeStream(result)
    expect(text).toContain('hello')
    expect(text).toContain('world')

    expect(mockGetTransformer).not.toHaveBeenCalled()
    expect(mockUpgradeToStreamLog).toHaveBeenCalledTimes(1)
  })

  /* 2. Cross-protocol → needs transformation, pipes through ingress and egress transformers */
  it('pipes through ingress and egress transformers for cross-protocol', async () => {
    const ingressTransform = mock(async (stream: ReadableStream) => stream)
    const egressTransform = mock(async (stream: ReadableStream) => stream)

    mockGetTransformer.mockImplementation((name: string) => {
      if (name === 'anthropic') {
        return { transformStream: ingressTransform }
      }
      if (name === 'openai') {
        return { transformStream: egressTransform }
      }
      return undefined
    })

    const events = [{ id: '1', choices: [{ delta: { content: 'hello' } }] }]

    const params = createParams({
      incomingProtocol: 'openai',
      targetProtocol: 'anthropic',
      response: new Response(createSSEStream(events), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    })

    const result = await handleStreamingResponse(params)
    expect(result).toBeInstanceOf(Response)
    await consumeStream(result)

    expect(mockGetTransformer).toHaveBeenCalledTimes(2)
    expect(mockGetTransformer).toHaveBeenNthCalledWith(1, 'anthropic')
    expect(mockGetTransformer).toHaveBeenNthCalledWith(2, 'openai')
    expect(ingressTransform).toHaveBeenCalledTimes(1)
    expect(egressTransform).toHaveBeenCalledTimes(1)
  })

  /* 3. Cross-protocol but no stream transformer available → warns and skips */
  it('skips ingress transformation when no stream normalizer is available', async () => {
    mockGetTransformer.mockReturnValue(undefined)

    const events = [{ id: '1', choices: [{ delta: { content: 'hello' } }] }]

    const params = createParams({
      incomingProtocol: 'openai',
      targetProtocol: 'anthropic',
      response: new Response(createSSEStream(events), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    })

    const result = await handleStreamingResponse(params)
    expect(result).toBeInstanceOf(Response)
    await consumeStream(result)

    expect(mockGetTransformer).toHaveBeenCalledTimes(2)
    expect(mockFinalizeStreamLog).toHaveBeenCalledTimes(1)
  })

  /* 4. Model remap when isMapped → createModelRemapStream is applied */
  it('applies model remap stream when isMapped=true', async () => {
    const events = [{ id: '1', model: 'backend-model', choices: [{ delta: { content: 'hello' } }] }]

    const params = createParams({
      isMapped: true,
      originalModelName: 'virtual-model',
      response: new Response(createSSEStream(events), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    })

    const result = await handleStreamingResponse(params)
    const text = await consumeStream(result)

    expect(text).toContain('"model":"virtual-model"')
    expect(text).toContain('hello')
  })

  /* 5. Stream completes successfully → finalizeStreamLog called with success */
  it('calls finalizeStreamLog with success when stream completes', async () => {
    const events = [{ id: '1', choices: [{ delta: { content: 'a' } }] }]

    const params = createParams({
      response: new Response(createSSEStream(events), {
        headers: { 'content-type': 'text/event-stream' },
      }),
      logId: 'log-123',
      attemptId: 'attempt-456',
    })

    const result = await handleStreamingResponse(params)
    await consumeStream(result)

    // Wait for async flush
    await new Promise((r) => setTimeout(r, 50))

    expect(mockFinalizeStreamLog).toHaveBeenCalledTimes(1)
    const callArgs = mockFinalizeStreamLog.mock.calls[0] as unknown[]
    expect(callArgs[0]).toBe('log-123')
    expect(callArgs[1]).toMatchObject({
      attemptId: 'attempt-456',
      status: 'success',
      statusCode: 200,
    })
  })

  /* 6. Client disconnect → finalizeLog failure and markStreamAborted called */
  it('finalizes log as failure and marks stream aborted on client disconnect', async () => {
    const abortController = new AbortController()
    const events = [{ id: '1', choices: [{ delta: { content: 'a' } }] }]

    const params = createParams({
      response: new Response(createSSEStream(events), {
        headers: { 'content-type': 'text/event-stream' },
      }),
      logId: 'log-789',
      attemptId: 'attempt-abc',
      request: new Request('http://localhost/v1/chat/completions', {
        signal: abortController.signal,
      }),
    })

    const result = await handleStreamingResponse(params)

    // Start reading but abort mid-stream
    const reader = result.body!.getReader()
    await reader.read() // read first chunk
    abortController.abort()

    // Wait for abort handler
    await new Promise((r) => setTimeout(r, 50))

    expect(mockMarkStreamAborted).toHaveBeenCalledTimes(1)
    const abortedArgs = mockMarkStreamAborted.mock.calls[0] as unknown[]
    expect(abortedArgs[0]).toBe('log-789')
    expect(abortedArgs[1]).toBe('attempt-abc')
  })

  /* 6b. Client disconnect AFTER stream fully consumed → success kept, no abort mark */
  it('does not mark stream aborted when client disconnects after stream finalized', async () => {
    const abortController = new AbortController()
    const events = [{ id: '1', choices: [{ delta: { content: 'a' } }] }]

    const params = createParams({
      response: new Response(createSSEStream(events), {
        headers: { 'content-type': 'text/event-stream' },
      }),
      logId: 'log-finalized',
      attemptId: 'attempt-finalized',
      request: new Request('http://localhost/v1/chat/completions', {
        signal: abortController.signal,
      }),
    })

    const result = await handleStreamingResponse(params)

    // Fully consume the stream → flush runs → finalizeLog('success') completes
    await consumeStream(result)
    await new Promise((r) => setTimeout(r, 50))
    expect(mockFinalizeStreamLog).toHaveBeenCalledTimes(1)

    // Disconnect after finalization must NOT overwrite the success record
    abortController.abort()
    await new Promise((r) => setTimeout(r, 50))

    expect(mockMarkStreamAborted).not.toHaveBeenCalled()
    const callArgs = mockFinalizeStreamLog.mock.calls[0] as unknown[]
    expect(callArgs[1]).toMatchObject({ status: 'success' })
  })
  /* 7. logEventBus emits started event on stream start */
  it('emits started event via logEventBus', async () => {
    const events = [{ id: '1', choices: [{ delta: { content: 'hello' } }] }]

    const params = createParams({
      logId: 'log-started',
      response: new Response(createSSEStream(events), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    })

    await handleStreamingResponse(params)

    expect(mockEmitLog).toHaveBeenCalled()
    const startedCalls = (mockEmitLog.mock.calls as Record<string, unknown>[][]).filter(
      (c: Record<string, unknown>[]) => c[0].event === 'started',
    )
    expect(startedCalls.length).toBeGreaterThanOrEqual(1)
    expect(startedCalls[0][0]).toMatchObject({
      event: 'started',
      logId: 'log-started',
      providerName: 'TestProvider',
    })
  })

  /* 8. logEventBus emits chunk events during streaming */
  it('emits chunk events via logEventBus during streaming', async () => {
    // Emit enough chunks to trigger chunk logging (every 10 chunks or 500ms)
    const events = Array.from({ length: 12 }, (_, i) => ({
      id: String(i + 1),
      choices: [{ delta: { content: String.fromCharCode(97 + (i % 26)) } }],
    }))

    const params = createParams({
      logId: 'log-chunks',
      response: new Response(createSSEStream(events), {
        headers: { 'content-type': 'text/event-stream' },
      }),
    })

    const result = await handleStreamingResponse(params)
    await consumeStream(result)

    // Wait for flush
    await new Promise((r) => setTimeout(r, 50))

    const chunkCalls = (mockEmitLog.mock.calls as Record<string, unknown>[][]).filter(
      (c: Record<string, unknown>[]) => c[0].event === 'chunk',
    )
    expect(chunkCalls.length).toBeGreaterThanOrEqual(1)
    expect(chunkCalls[0][0]).toMatchObject({
      event: 'chunk',
      logId: 'log-chunks',
    })
  })
})
