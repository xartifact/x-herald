import { describe, it, expect, mock, beforeEach, afterEach, afterAll } from 'bun:test'
import { getDatabase } from '../../db/client'
import * as realDbClient from '../../db/client'
import * as realLogger from '../../lib/logger'

const realGetDatabase = getDatabase

let currentMockDb: ReturnType<typeof createMockDb> | null

function createMockDb() {
  const selectWhereMock = mock((): Promise<unknown[]> => Promise.resolve([]))
  const selectGroupByOrderByMock = mock((): Promise<unknown[]> => Promise.resolve([]))
  const insertValuesMock = mock(() => ({
    then: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
      resolve(undefined),
  }))

  return {
    select: mock(() => ({
      from: mock(() => ({
        where: mock(() => ({
          groupBy: mock(() => ({
            orderBy: selectGroupByOrderByMock,
          })),
          then: (resolve: (value: unknown) => void) => resolve(selectWhereMock()),
        })),
        orderBy: mock(() => Promise.resolve([])),
      })),
    })),
    insert: mock(() => ({
      values: insertValuesMock,
    })),
    update: mock(() => ({
      set: mock(() => ({
        where: mock(() => ({
          returning: mock(() => Promise.resolve([])),
        })),
      })),
    })),
    delete: mock(() => ({
      where: mock(() => Promise.resolve()),
    })),
    _selectWhere: selectWhereMock,
    _selectGroupByOrderBy: selectGroupByOrderByMock,
    _insertValues: insertValuesMock,
  }
}

mock.module('../../db/client', () => ({
  ...realDbClient,
  getDatabase: () => currentMockDb ?? realGetDatabase(),
}))

mock.module('../../lib/logger', () => ({
  ...realLogger,
  default: {
    child: () => ({ info: mock(), warn: mock(), error: mock() }),
    warn: mock(),
    info: mock(),
    error: mock(),
    trace: mock(),
    debug: mock(),
  },
}))

import { CostService } from './service'

afterAll(() => {
  mock.module('../../db/client', () => ({
    getDatabase: realGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }))
  mock.module('../../lib/logger', () => realLogger)
})

describe('costs service', () => {
  let costService: CostService

  beforeEach(() => {
    currentMockDb = createMockDb()
    costService = new CostService()
  })

  afterEach(() => {
    mock.restore()
    currentMockDb = null
  })

  it('recordCost inserts cost record with calculated costs', async () => {
    currentMockDb!._insertValues.mockReturnValue({
      then: (resolve: (value: unknown) => void) => resolve(undefined),
    })
    await costService.recordCost({
      providerName: 'openai',
      inputTokens: 1000,
      outputTokens: 500,
    })
    expect(currentMockDb!._insertValues.mock.calls.length).toBe(1)
  })

  it('getCostSummary returns zero values for empty DB', async () => {
    currentMockDb!._selectWhere.mockReturnValue(
      Promise.resolve([
        {
          totalCost: 0,
          totalInputTokens: 0,
          totalOutputTokens: 0,
          requestCount: 0,
        },
      ]),
    )
    const result = await costService.getCostSummary({})
    expect(result.totalCost).toBe(0)
    expect(result.totalInputTokens).toBe(0)
    expect(result.totalOutputTokens).toBe(0)
    expect(result.requestCount).toBe(0)
  })

  it('getCostSummary aggregates costs correctly', async () => {
    currentMockDb!._selectWhere.mockReturnValue(
      Promise.resolve([
        {
          totalCost: 10.5,
          totalInputTokens: 1000,
          totalOutputTokens: 500,
          requestCount: 5,
        },
      ]),
    )
    const result = await costService.getCostSummary({})
    expect(result.totalCost).toBe(10.5)
    expect(result.totalInputTokens).toBe(1000)
    expect(result.totalOutputTokens).toBe(500)
    expect(result.requestCount).toBe(5)
  })

  it('getCostSummary filters by date range', async () => {
    currentMockDb!._selectWhere.mockReturnValue(
      Promise.resolve([
        {
          totalCost: 5,
          totalInputTokens: 500,
          totalOutputTokens: 300,
          requestCount: 2,
        },
      ]),
    )
    const result = await costService.getCostSummary({
      startDate: new Date('2024-01-01'),
      endDate: new Date('2024-01-31'),
    })
    expect(result.totalCost).toBe(5)
  })

  it('getCostByDimension returns key breakdown', async () => {
    currentMockDb!._selectGroupByOrderBy.mockReturnValue(
      Promise.resolve([
        { name: 'key-1', totalCost: 5.0, requestCount: 2, inputTokens: 500, outputTokens: 300 },
        { name: 'key-2', totalCost: 3.0, requestCount: 1, inputTokens: 200, outputTokens: 100 },
      ]),
    )
    const result = await costService.getCostByDimension({ dimension: 'key' })
    expect(result).toHaveLength(2)
    expect(result[0].name).toBe('key-1')
    expect(result[0].totalCost).toBe(5.0)
    expect(result[0].requestCount).toBe(2)
    expect(result[0].inputTokens).toBe(500)
    expect(result[0].outputTokens).toBe(300)
  })

  it('getCostByDimension returns provider breakdown', async () => {
    currentMockDb!._selectGroupByOrderBy.mockReturnValue(
      Promise.resolve([
        { name: 'openai', totalCost: 5.0, requestCount: 2, inputTokens: 500, outputTokens: 300 },
      ]),
    )
    const result = await costService.getCostByDimension({ dimension: 'provider' })
    expect(result[0].name).toBe('openai')
    expect(result[0].totalCost).toBe(5.0)
  })

  it('getCostByDimension returns model breakdown', async () => {
    currentMockDb!._selectGroupByOrderBy.mockReturnValue(
      Promise.resolve([
        { name: 'gpt-4', totalCost: 5.0, requestCount: 2, inputTokens: 500, outputTokens: 300 },
      ]),
    )
    const result = await costService.getCostByDimension({ dimension: 'model' })
    expect(result[0].name).toBe('gpt-4')
    expect(result[0].totalCost).toBe(5.0)
  })

  it('calculateCost computes costs correctly for openai', () => {
    const result = costService.calculateCost('openai', 1000, 500)
    expect(result.inputCost).toBe(0.005)
    expect(result.outputCost).toBe(0.0075)
    expect(result.totalCost).toBe(0.0125)
  })

  it('calculateCost uses default pricing for unknown provider', () => {
    const result = costService.calculateCost('unknown', 1000, 500)
    expect(result.inputCost).toBe(0.005)
    expect(result.outputCost).toBe(0.0075)
    expect(result.totalCost).toBe(0.0125)
  })

  it('setPricing and getPricing work correctly', () => {
    costService.setPricing('custom', { inputPer1k: 0.01, outputPer1k: 0.02 })
    const pricing = costService.getPricing('custom')
    expect(pricing).toEqual({ inputPer1k: 0.01, outputPer1k: 0.02 })
  })

  it('getAllPricing returns a copy of pricing map', () => {
    const all = costService.getAllPricing()
    all.set('new', { inputPer1k: 0.01, outputPer1k: 0.02 })
    expect(costService.getPricing('new')).toBeUndefined()
  })

  it('handles DB errors gracefully in recordCost', async () => {
    currentMockDb!._insertValues.mockReturnValue({
      then: (_resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
        reject(new Error('DB error')),
    })
    await expect(
      costService.recordCost({
        providerName: 'openai',
        inputTokens: 1000,
        outputTokens: 500,
      }),
    ).resolves.toBeUndefined()
  })

  it('propagates DB errors in getCostSummary', async () => {
    currentMockDb!._selectWhere.mockReturnValue(Promise.reject(new Error('DB error')))
    await expect(costService.getCostSummary({})).rejects.toThrow('DB error')
  })

  it('propagates DB errors in getCostByDimension', async () => {
    currentMockDb!._selectGroupByOrderBy.mockReturnValue(Promise.reject(new Error('DB error')))
    await expect(costService.getCostByDimension({ dimension: 'key' })).rejects.toThrow('DB error')
  })
})
