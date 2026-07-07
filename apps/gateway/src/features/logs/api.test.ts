import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  setupCrudTest,
  teardownCrudTest,
  authGet,
  authPost,
  authDelete,
  unauthGet,
  type CrudTestContext,
} from '../../test/crud-helper'

let ctx: CrudTestContext

describe('logs API - auth', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('rejects unauthenticated GET /', async () => {
    const res = await unauthGet(ctx, '/api/logs/')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated GET /stats/overview', async () => {
    const res = await unauthGet(ctx, '/api/logs/stats/overview')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated GET /stats/storage', async () => {
    const res = await unauthGet(ctx, '/api/logs/stats/storage')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated GET /stats/keys', async () => {
    const res = await unauthGet(ctx, '/api/logs/stats/keys')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated GET /stats/providers', async () => {
    const res = await unauthGet(ctx, '/api/logs/stats/providers')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated GET /client-models', async () => {
    const res = await unauthGet(ctx, '/api/logs/client-models')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated GET /:id', async () => {
    const res = await unauthGet(ctx, '/api/logs/abc123')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated POST /cleanup', async () => {
    const res = await ctx.app.request('/api/logs/cleanup', { method: 'POST' })
    expect(res.status).toBe(401)
  })
})

describe('logs API - GET /', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns a paginated list on a fresh database', async () => {
    const res = await authGet(ctx, '/api/logs')
    expect(res.status).toBe(200)
  })

  it('accepts page and pageSize query params', async () => {
    const res = await authGet(ctx, '/api/logs?page=1&pageSize=10')
    expect(res.status).toBe(200)
  })
})

describe('logs API - GET /stats/overview', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns the overview stats', async () => {
    const res = await authGet(ctx, '/api/logs/stats/overview')
    expect(res.status).toBe(200)
  })
})

describe('logs API - GET /stats/storage', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns the storage stats', async () => {
    const res = await authGet(ctx, '/api/logs/stats/storage')
    expect(res.status).toBe(200)
  })
})

describe('logs API - GET /stats/keys', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns the key stats', async () => {
    const res = await authGet(ctx, '/api/logs/stats/keys')
    expect(res.status).toBe(200)
  })
})

describe('logs API - GET /stats/providers', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns the provider stats', async () => {
    const res = await authGet(ctx, '/api/logs/stats/providers')
    expect(res.status).toBe(200)
  })
})

describe('logs API - GET /client-models', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns the client model stats', async () => {
    const res = await authGet(ctx, '/api/logs/client-models')
    expect(res.status).toBe(200)
  })
})

describe('logs API - GET /:id (404 for unknown)', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns 404 for an unknown log id', async () => {
    const res = await authGet(ctx, '/api/logs/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })

  it('returns 404 when deleting an unknown log id', async () => {
    const res = await authDelete(ctx, '/api/logs/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })
})

describe('logs API - POST /rank-recalculate', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns 500 when CRON_SECRET is not configured', async () => {
    const res = await authPost(ctx, '/api/logs/rank-recalculate', {})
    expect(res.status).toBe(500)
  })
})
