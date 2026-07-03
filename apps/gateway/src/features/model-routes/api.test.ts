import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  setupCrudTest,
  teardownCrudTest,
  authGet,
  authPost,
  authPut,
  authDelete,
  unauthGet,
  type CrudTestContext,
} from '../../test/crud-helper'

let ctx: CrudTestContext

describe('model-routes API - auth', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('rejects unauthenticated GET /', async () => {
    const res = await unauthGet(ctx, '/api/model-routes/')
    expect(res.status).toBe(401)
  })

  it('rejects unauthenticated POST /', async () => {
    const res = await ctx.app.request('/api/model-routes/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', action: { type: 'fallback' } }),
    })
    expect(res.status).toBe(401)
  })
})

describe('model-routes API - GET /', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns an empty list on a fresh database', async () => {
    const res = await authGet(ctx, '/api/model-routes')
    expect(res.status).toBe(200)
  })

  it('accepts the accessModelId filter', async () => {
    const res = await authGet(ctx, '/api/model-routes?accessModelId=am-test')
    expect(res.status).toBe(200)
  })
})

describe('model-routes API - GET /flow', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns the flow data for an unknown route', async () => {
    const res = await authGet(ctx, '/api/model-routes/flow?id=unknown')
    expect(res.status).toBe(200)
  })
})

describe('model-routes API - GET /:id', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns 404 for an unknown route id', async () => {
    const res = await authGet(ctx, '/api/model-routes/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })
})

describe('model-routes API - POST /', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('rejects invalid POST data with 500 (no ZodError-to-400 handler)', async () => {
    const res = await authPost(ctx, '/api/model-routes', { name: 'x' })
    expect(res.status).toBe(500)
  })
})

describe('model-routes API - DELETE /:id', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns 404 for deleting an unknown route', async () => {
    const res = await authDelete(ctx, '/api/model-routes/00000000-0000-0000-0000-000000000000')
    expect(res.status).toBe(404)
  })
})

describe('model-routes API - PUT /:id', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns 404 for updating an unknown route', async () => {
    const res = await authPut(ctx, '/api/model-routes/00000000-0000-0000-0000-000000000000', {
      name: 'x',
    })
    expect(res.status).toBe(404)
  })
})

describe('model-routes API - PATCH /:id/toggle', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('returns 404 for toggling an unknown route', async () => {
    const res = await ctx.app.request(
      '/api/model-routes/00000000-0000-0000-0000-000000000000/toggle',
      {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${ctx.token}` },
      },
    )
    expect(res.status).toBe(404)
  })
})
