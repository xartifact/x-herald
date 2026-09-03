import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test'

const realDbClient = await import('../../../db/client')
const originalGetDatabase = realDbClient.getDatabase
const realLogger = await import('../../../lib/logger')
const realUsageTracker = await import('../../../features/keys/usage-tracker')
const realCostService = await import('../../../features/costs/service')
const realClientModelRecorder =
  await import('../../../features/logs/services/client-model-recorder')
const realMetadataExtractor = await import('../metadata-extractor')
const realRateLimitEngine = await import('../rate-limit-engine')
const realTokenEstimator = await import('../token-estimator')

// ─── Mock dependency state ────────────────────────────────────────────────────

interface MockDbState {
  insertReturning: Promise<unknown>
  updateWhereResult: Promise<unknown>
  insert: ReturnType<typeof mock>
  insertValues: ReturnType<typeof mock>
  update: ReturnType<typeof mock>
  updateSet: ReturnType<typeof mock>
}

function createMockDb(): MockDbState {
  const state: MockDbState = {
    insertReturning: Promise.resolve([{ id: 'new-log-id-123' }]),
    updateWhereResult: Promise.resolve([]),
    insert: null!,
    insertValues: null!,
    update: null!,
    updateSet: null!,
  }

  state.insertValues = mock(() => ({
    returning: mock(() => state.insertReturning),
  }))
  state.insert = mock(() => ({ values: state.insertValues }))
  state.updateSet = mock(() => ({
    where: mock(() => state.updateWhereResult),
  }))
  state.update = mock(() => ({ set: state.updateSet }))

  return state
}

let mockDb = createMockDb()

// ─── Mock modules ─────────────────────────────────────────────────────────────

mock.module('../../../db/client', () => ({
  getDatabase: mock(() => ({
    insert: mockDb.insert,
    update: mockDb.update,
    transaction: mock((callback) => callback({ insert: mockDb.insert, update: mockDb.update })),
  })),
}))

mock.module('../../../lib/logger', () => ({
  default: {
    debug: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    info: mock(() => {}),
    trace: mock(() => {}),
    child: mock(() => ({
      debug: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      info: mock(() => {}),
      trace: mock(() => {}),
    })),
  },
}))

afterAll(() => {
  mock.module('../../../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }))
  mock.module('../../../lib/logger', () => realLogger)
  mock.module('../../../features/keys/usage-tracker', () => realUsageTracker)
  mock.module('../../../features/costs/service', () => realCostService)
  mock.module(
    '../../../features/logs/services/client-model-recorder',
    () => realClientModelRecorder,
  )
  mock.module('../metadata-extractor', () => realMetadataExtractor)
  mock.module('../rate-limit-engine', () => realRateLimitEngine)
  mock.module('../token-estimator', () => realTokenEstimator)
})

mock.module('../../../features/keys/usage-tracker', () => ({
  trackKeyUsage: mock(async () => {}),
}))

mock.module('../../../features/costs/service', () => ({
  costService: {
    recordCost: mock(async () => {}),
  },
}))

mock.module('../../../features/logs/services/client-model-recorder', () => ({
  recordClientRequestedModel: mock(async () => {}),
}))

mock.module('../metadata-extractor', () => ({
  extractMetadata: mock(() => ({
    toolCalls: { tools: [] },
    performance: {},
  })),
}))

mock.module('../rate-limit-engine', () => ({
  rateLimitEngine: {
    check: mock(() => ({ allowed: true })),
  },
}))

mock.module('../token-estimator', () => ({
  estimateUsageFromContent: mock(() => ({ inputTokens: 50, outputTokens: 30 })),
}))

// ─── Import module under test ─────────────────────────────────────────────────

const { logRequest, markLogAsFailed } = await import('../log-service?v=1')
const { estimateUsageFromContent } = await import('../token-estimator')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createBaseParams(overrides: Record<string, unknown> = {}) {
  return {
    virtualKey: { id: 'vk-1', name: 'test-key' },
    modelName: 'gpt-4',
    providerId: 'prov-1',
    providerName: 'openai',
    status: 'success' as const,
    statusCode: 200,
    responseTimeMs: 500,
    inputTokens: 100,
    outputTokens: 50,
    requestPath: '/v1/chat/completions',
    requestMethod: 'POST',
    streaming: false,
    ...overrides,
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('logRequest', () => {
  beforeEach(async () => {
    mock.restore()
    mockDb = createMockDb()

    // Clear shared mock call counts (mock.module mocks persist across tests)
    const rle = await import('../rate-limit-engine')
    rle.rateLimitEngine.check.mockClear()
    const cs = await import('../../../features/costs/service')
    cs.costService.recordCost.mockClear()
    const ut = await import('../../../features/keys/usage-tracker')
    ut.trackKeyUsage.mockClear()
    estimateUsageFromContent.mockClear()
    const crm = await import('../../../features/logs/services/client-model-recorder')
    crm.recordClientRequestedModel.mockClear()
  })

  describe('INSERT path (no logId)', () => {
    it('should insert request log + attempt record', async () => {
      await logRequest(createBaseParams())

      // logRequest does 2 inserts: requestLogs + requestAttempts
      expect(mockDb.insert).toHaveBeenCalledTimes(2)
      expect(mockDb.insertValues).toHaveBeenCalledTimes(2)
    })

    it('should call rateLimitEngine.check when virtualKey.id and tokens > 0', async () => {
      const { rateLimitEngine } = await import('../rate-limit-engine')

      await logRequest(createBaseParams({ inputTokens: 10, outputTokens: 5 }))

      expect(rateLimitEngine.check).toHaveBeenCalledWith('vk-1', {}, 15)
    })

    it('should call rateLimitEngine.check with estimated tokens when input+output=0', async () => {
      const { rateLimitEngine } = await import('../rate-limit-engine')

      await logRequest(createBaseParams({ inputTokens: 0, outputTokens: 0 }))

      // estimateUsageFromContent returns 50+30=80 → totalTokens=80 > 0, so check IS called
      expect(rateLimitEngine.check).toHaveBeenCalled()
      expect(rateLimitEngine.check).toHaveBeenCalledWith('vk-1', {}, 80)
    })

    it('should call estimateUsageFromContent when input+output tokens are 0', async () => {
      await logRequest(createBaseParams({ inputTokens: 0, outputTokens: 0 }))

      expect(estimateUsageFromContent).toHaveBeenCalled()
    })

    it('should NOT call estimateUsageFromContent when tokens are provided', async () => {
      await logRequest(createBaseParams({ inputTokens: 100, outputTokens: 50 }))

      expect(estimateUsageFromContent).toHaveBeenCalledTimes(0)
    })

    it('should record cost when providerName and tokens > 0', async () => {
      const { costService } = await import('../../../features/costs/service')

      await logRequest(
        createBaseParams({ providerName: 'openai', inputTokens: 10, outputTokens: 5 }),
      )

      expect(costService.recordCost).toHaveBeenCalled()
      const callArg = (costService.recordCost as ReturnType<typeof mock>).mock.calls[0][0]
      expect(callArg.modelName).toBe('gpt-4')
      expect(callArg.providerName).toBe('openai')
    })

    it('should NOT record cost when providerName is missing even with tokens', async () => {
      const { costService } = await import('../../../features/costs/service')

      await logRequest(
        createBaseParams({ providerName: undefined, inputTokens: 10, outputTokens: 5 }),
      )

      expect(costService.recordCost).toHaveBeenCalledTimes(0)
    })

    it('should record cost with estimated tokens when input+output=0', async () => {
      const { costService } = await import('../../../features/costs/service')

      await logRequest(
        createBaseParams({ providerName: 'openai', inputTokens: 0, outputTokens: 0 }),
      )

      // After estimation: 50+30=80 > 0, so cost IS recorded
      expect(costService.recordCost).toHaveBeenCalledTimes(1)
    })

    it('should call trackKeyUsage when inputTokens and outputTokens > 0', async () => {
      const { trackKeyUsage } = await import('../../../features/keys/usage-tracker')

      await logRequest(createBaseParams({ inputTokens: 10, outputTokens: 5 }))

      expect(trackKeyUsage).toHaveBeenCalled()
      const callArg = (trackKeyUsage as ReturnType<typeof mock>).mock.calls[0][0]
      expect(callArg.keyId).toBe('vk-1')
      expect(callArg.inputTokens).toBe(10)
      expect(callArg.outputTokens).toBe(5)
    })

    it('should NOT call trackKeyUsage when inputTokens is 0', async () => {
      const { trackKeyUsage } = await import('../../../features/keys/usage-tracker')

      await logRequest(createBaseParams({ inputTokens: 0, outputTokens: 5 }))

      // inputTokens=0 → condition (inputTokens>0 && outputTokens>0) is false
      expect(trackKeyUsage).toHaveBeenCalledTimes(0)
    })

    it('should call recordClientRequestedModel via dynamic import', async () => {
      const { recordClientRequestedModel } =
        await import('../../../features/logs/services/client-model-recorder')

      await logRequest(createBaseParams({ originalModelName: 'gpt-4-turbo' }))

      expect(recordClientRequestedModel).toHaveBeenCalledWith('gpt-4-turbo')
    })
  })

  describe('UPDATE path (with logId)', () => {
    it('should update request log by logId', async () => {
      await logRequest(createBaseParams({ logId: 'existing-log-1' }))

      expect(mockDb.update).toHaveBeenCalledTimes(1)
    })

    it('should update attempt when attemptId is non-temp', async () => {
      await logRequest(createBaseParams({ logId: 'existing-log-1', attemptId: 'attempt-real-1' }))

      expect(mockDb.update).toHaveBeenCalledTimes(2)
    })

    it('should skip attempt update when attemptId starts with temp-', async () => {
      await logRequest(createBaseParams({ logId: 'existing-log-1', attemptId: 'temp-attempt-1' }))

      expect(mockDb.update).toHaveBeenCalledTimes(1)
    })

    it('should record cost in UPDATE path when providerName and tokens > 0', async () => {
      const { costService } = await import('../../../features/costs/service')

      await logRequest(
        createBaseParams({
          logId: 'existing-log-1',
          providerName: 'openai',
          inputTokens: 10,
          outputTokens: 5,
        }),
      )

      expect(costService.recordCost).toHaveBeenCalled()
    })

    it('should skip cost recording in UPDATE path when providerName is missing', async () => {
      const { costService } = await import('../../../features/costs/service')

      await logRequest(
        createBaseParams({
          logId: 'existing-log-1',
          providerName: undefined,
          inputTokens: 10,
          outputTokens: 5,
        }),
      )

      expect(costService.recordCost).toHaveBeenCalledTimes(0)
    })

    it('should NOT call recordClientRequestedModel or insert in UPDATE path', async () => {
      const { recordClientRequestedModel } =
        await import('../../../features/logs/services/client-model-recorder')

      await logRequest(createBaseParams({ logId: 'existing-log-1' }))

      expect(recordClientRequestedModel).toHaveBeenCalledTimes(0)
      expect(mockDb.insert).toHaveBeenCalledTimes(0)
    })
  })

  describe('error handling', () => {
    it('should rethrow DB error when not in production', async () => {
      mockDb.insertReturning = Promise.reject(new Error('DB connection lost'))

      await expect(logRequest(createBaseParams())).rejects.toThrow('DB connection lost')
    })
  })

  describe('requestBody with stream content', () => {
    it('should handle streaming response with streamContent/streamProgress', async () => {
      await logRequest(
        createBaseParams({
          streaming: true,
          responseBody: {
            streamContent: { chunks: ['abc'] },
            streamProgress: { chunksProcessed: 1 },
          },
        }),
      )

      expect(mockDb.insertValues).toHaveBeenCalled()
    })
  })
})

describe('markLogAsFailed', () => {
  beforeEach(() => {
    mock.restore()
    mockDb = createMockDb()
  })

  it('should return early when logId starts with temp-', async () => {
    await markLogAsFailed({
      logId: 'temp-abc',
      attemptId: 'attempt-1',
      statusCode: 500,
      errorMessage: 'Error',
    })

    expect(mockDb.update).toHaveBeenCalledTimes(0)
  })

  it('should return early when logId is empty', async () => {
    await markLogAsFailed({
      logId: '',
      attemptId: 'attempt-1',
      statusCode: 500,
      errorMessage: 'Error',
    })

    expect(mockDb.update).toHaveBeenCalledTimes(0)
  })

  it('should update log and attempt for valid params', async () => {
    await markLogAsFailed({
      logId: 'log-1',
      attemptId: 'attempt-1',
      statusCode: 500,
      errorMessage: 'Provider error',
      retryCount: 2,
      responseTimeMs: 1000,
      failoverReason: 'http_5xx',
    })

    expect(mockDb.update).toHaveBeenCalledTimes(2)
  })

  it('should skip attempt update when attemptId starts with temp-', async () => {
    await markLogAsFailed({
      logId: 'log-1',
      attemptId: 'temp-attempt-1',
      statusCode: 500,
      errorMessage: 'Error',
    })

    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('should handle log update only when attemptId is missing', async () => {
    await markLogAsFailed({
      logId: 'log-1',
      attemptId: '',
      statusCode: 500,
      errorMessage: 'Error',
    })

    expect(mockDb.update).toHaveBeenCalledTimes(1)
  })

  it('should not throw on DB error (caught by internal try/catch)', async () => {
    mockDb.updateWhereResult = Promise.reject(new Error('DB failure'))

    await expect(
      markLogAsFailed({
        logId: 'log-1',
        attemptId: 'attempt-1',
        statusCode: 500,
        errorMessage: 'Error',
      }),
    ).resolves.toBeUndefined()
  })

  it('should persist providerResponseBody onto the attempt row', async () => {
    const providerResponseBody = { code: 500, message: '系统异常，请联系客服获取支持。', data: {} }
    await markLogAsFailed({
      logId: 'log-1',
      attemptId: 'attempt-1',
      statusCode: 500,
      errorMessage: 'Failover: HTTP 500',
      providerResponseBody,
    })

    // second update (attempt row) set() must carry providerResponseBody
    const updateSetCalls = mockDb.updateSet.mock.calls as unknown[][]
    expect(updateSetCalls.length).toBeGreaterThanOrEqual(2)
    const attemptSet = updateSetCalls[1][0] as { providerResponseBody?: unknown }
    expect(attemptSet.providerResponseBody).toEqual(providerResponseBody)
  })
})
