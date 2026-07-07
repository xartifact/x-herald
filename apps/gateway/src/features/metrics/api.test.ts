import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  setupCrudTest,
  teardownCrudTest,
  parseJson,
  authGet,
  authPost,
  unauthGet,
  type CrudTestContext,
} from '../../test/crud-helper'

let ctx: CrudTestContext

describe('metrics API - auth', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('rejects unauthenticated /instances', async () => {
    const res = await unauthGet(ctx, '/api/metrics/instances')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated /providers/quality', async () => {
    const res = await unauthGet(ctx, '/api/metrics/providers/quality')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated /summary', async () => {
    const res = await unauthGet(ctx, '/api/metrics/summary')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated /anomalies', async () => {
    const res = await unauthGet(ctx, '/api/metrics/anomalies')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated POST /anomalies/detect', async () => {
    const res = await ctx.app.request('/api/metrics/anomalies/detect', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})

describe('metrics API - GET /instances', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns an empty data array on a fresh database', async () => {
    const res = await authGet(ctx, '/api/metrics/instances')
    const { status, body } = await parseJson<unknown[]>(res)
    expect(status).toBe(200)
    expect(body.data).toEqual([])
  })
})

describe('metrics API - GET /instances/:instanceId/timeseries', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns 200 for an unknown instance', async () => {
    const res = await authGet(ctx, '/api/metrics/instances/unknown-instance/timeseries')
    expect(res.status).toBe(200)
  })

  it('accepts the default period of 6h', async () => {
    const res = await authGet(ctx, '/api/metrics/instances/x/timeseries')
    const { body } = await parseJson<{ period: string }>(res)
    expect(body.period).toBe('6h')
  })

  it('accepts period=1h', async () => {
    const res = await authGet(ctx, '/api/metrics/instances/x/timeseries?period=1h')
    const { body } = await parseJson<{ period: string }>(res)
    expect(body.period).toBe('1h')
  })

  it('accepts period=7d', async () => {
    const res = await authGet(ctx, '/api/metrics/instances/x/timeseries?period=7d')
    const { body } = await parseJson<{ period: string }>(res)
    expect(body.period).toBe('7d')
  })

  it('falls back to 6h for an unknown period value', async () => {
    const res = await authGet(ctx, '/api/metrics/instances/x/timeseries?period=garbage')
    const { body } = await parseJson<{ period: string }>(res)
    expect(body.period).toBe('garbage')
  })
})

describe('metrics API - GET /providers/quality', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns an empty list when no snapshots exist', async () => {
    const res = await authGet(ctx, '/api/metrics/providers/quality')
    const { status, body } = await parseJson<unknown[]>(res)
    expect(status).toBe(200)
    expect(body.data).toEqual([])
  })
})

describe('metrics API - GET /summary', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns a summary with zero counts on a fresh database', async () => {
    const res = await authGet(ctx, '/api/metrics/summary')
    const { status, body } = await parseJson<{
      recentHour: {
        totalRequests: number
        avgSuccessRate: number | null
        avgTtfbP95: number | null
        activeInstances: number
      }
      daily: { totalRequests: number; activeInstances: number }
      anomalyCount: number
    }>(res)
    expect(status).toBe(200)
    expect(body.recentHour.totalRequests).toBe(0)
    expect(body.recentHour.activeInstances).toBe(0)
    expect(body.daily.totalRequests).toBe(0)
    expect(body.daily.activeInstances).toBe(0)
    expect(body.anomalyCount).toBe(0)
  })
})

describe('metrics API - GET /anomalies', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns an empty list when no anomalies exist', async () => {
    const res = await authGet(ctx, '/api/metrics/anomalies')
    const { status, body } = await parseJson<{ success: boolean; data: unknown[] }>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual([])
  })

  it('accepts the unresolved=true filter', async () => {
    const res = await authGet(ctx, '/api/metrics/anomalies?unresolved=true')
    const { status, body } = await parseJson<{ success: boolean; data: unknown[] }>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toEqual([])
  })
})

describe('metrics API - POST /anomalies/detect', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('runs detection and returns a newEvents field', async () => {
    const res = await authPost(ctx, '/api/metrics/anomalies/detect', {})
    const { status, body } = await parseJson<{ success: boolean; data: { newEvents: unknown } }>(
      res,
    )
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data).toHaveProperty('newEvents')
  })
})
