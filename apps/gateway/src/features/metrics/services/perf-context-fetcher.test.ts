import { describe, it, expect, mock, beforeEach, afterAll, type Mock } from 'bun:test'

const realDbClient = await import('../../../db/client')
const originalGetDatabase = realDbClient.getDatabase

let mockExecute: Mock<() => Promise<unknown[]>> = mock(
  (): Promise<unknown[]> => Promise.resolve([]),
)

const mockDb = {
  get execute() {
    return mockExecute
  },
}

mock.module('../../../db/client', () => ({
  getDatabase: mock(() => mockDb),
}))

import { fetchPerfContext } from './perf-context-fetcher'

afterAll(() => {
  mock.module('../../../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }))
})

describe('fetchPerfContext', () => {
  beforeEach(() => {
    mockExecute = mock((): Promise<unknown[]> => Promise.resolve([]))
  })

  it('returns default perf for empty groupIds', async () => {
    const result = await fetchPerfContext('vm-1', [])
    expect(result).toEqual({
      worstAnomalyLevel: 'unknown',
      maxAnomalyScore: null,
      minSuccessRate: null,
      maxTtfbP95: null,
      healthyRatio: 1,
    })
  })

  it('returns default perf when DB returns no rows', async () => {
    const result = await fetchPerfContext('vm-empty', ['g1'])
    expect(result.worstAnomalyLevel).toBe('unknown')
  })

  it('anomalyLevel: null score → unknown', async () => {
    mockExecute = mock(
      (): Promise<unknown[]> =>
        Promise.resolve([{ max_anomaly_score: null, total_count: 1, healthy_count: 1 }]),
    )
    const result = await fetchPerfContext('vm-null', ['g1'])
    expect(result.worstAnomalyLevel).toBe('unknown')
  })

  it('anomalyLevel: 0 score → normal', async () => {
    mockExecute = mock(
      (): Promise<unknown[]> =>
        Promise.resolve([{ max_anomaly_score: 0, total_count: 1, healthy_count: 1 }]),
    )
    const result = await fetchPerfContext('vm-0', ['g1'])
    expect(result.worstAnomalyLevel).toBe('normal')
  })

  it('anomalyLevel: 1 score → normal', async () => {
    mockExecute = mock(
      (): Promise<unknown[]> =>
        Promise.resolve([{ max_anomaly_score: 1, total_count: 1, healthy_count: 1 }]),
    )
    const result = await fetchPerfContext('vm-1', ['g1'])
    expect(result.worstAnomalyLevel).toBe('normal')
  })

  it('anomalyLevel: 2 score → warning (threshold)', async () => {
    mockExecute = mock(
      (): Promise<unknown[]> =>
        Promise.resolve([{ max_anomaly_score: 2, total_count: 1, healthy_count: 1 }]),
    )
    const result = await fetchPerfContext('vm-2', ['g1'])
    expect(result.worstAnomalyLevel).toBe('warning')
  })

  it('anomalyLevel: 4.9 score → warning', async () => {
    mockExecute = mock(
      (): Promise<unknown[]> =>
        Promise.resolve([{ max_anomaly_score: 4.9, total_count: 1, healthy_count: 1 }]),
    )
    const result = await fetchPerfContext('vm-49', ['g1'])
    expect(result.worstAnomalyLevel).toBe('warning')
  })

  it('anomalyLevel: 5 score → critical (threshold)', async () => {
    mockExecute = mock(
      (): Promise<unknown[]> =>
        Promise.resolve([{ max_anomaly_score: 5, total_count: 1, healthy_count: 1 }]),
    )
    const result = await fetchPerfContext('vm-5', ['g1'])
    expect(result.worstAnomalyLevel).toBe('critical')
  })

  it('anomalyLevel: 100 score → critical', async () => {
    mockExecute = mock(
      (): Promise<unknown[]> =>
        Promise.resolve([{ max_anomaly_score: 100, total_count: 1, healthy_count: 1 }]),
    )
    const result = await fetchPerfContext('vm-100', ['g1'])
    expect(result.worstAnomalyLevel).toBe('critical')
  })

  it('returns cached data on second call within TTL', async () => {
    mockExecute = mock(
      (): Promise<unknown[]> =>
        Promise.resolve([
          {
            max_anomaly_score: 3,
            total_count: 2,
            healthy_count: 1,
            min_success_rate: 0.95,
            max_ttfb_p95: 500,
          },
        ]),
    )
    const result1 = await fetchPerfContext('vm-cache', ['g1'])
    expect(result1.worstAnomalyLevel).toBe('warning')

    const callCountBefore = mockExecute.mock.calls.length
    const result2 = await fetchPerfContext('vm-cache', ['g1'])
    expect(result2.worstAnomalyLevel).toBe('warning')
    expect(mockExecute.mock.calls.length).toBe(callCountBefore)
  })

  it('returns default perf on DB error', async () => {
    mockExecute = mock((): Promise<unknown[]> => Promise.reject(new Error('DB error')))
    const result = await fetchPerfContext('vm-error', ['g1'])
    expect(result).toEqual({
      worstAnomalyLevel: 'unknown',
      maxAnomalyScore: null,
      minSuccessRate: null,
      maxTtfbP95: null,
      healthyRatio: 1,
    })
  })

  it('computes healthyRatio and other fields correctly', async () => {
    mockExecute = mock(
      (): Promise<unknown[]> =>
        Promise.resolve([
          {
            max_anomaly_score: 1,
            total_count: 4,
            healthy_count: 3,
            min_success_rate: 0.9,
            max_ttfb_p95: 200,
          },
        ]),
    )
    const result = await fetchPerfContext('vm-healthy', ['g1'])
    expect(result.worstAnomalyLevel).toBe('normal')
    expect(result.maxAnomalyScore).toBe(1)
    expect(result.minSuccessRate).toBe(0.9)
    expect(result.maxTtfbP95).toBe(200)
    expect(result.healthyRatio).toBe(0.75)
  })
})
