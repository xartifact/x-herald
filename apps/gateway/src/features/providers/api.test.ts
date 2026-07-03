import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  setupCrudTest,
  teardownCrudTest,
  parseJson,
  authGet,
  authPost,
  authPut,
  authDelete,
  unauthGet,
  uniqueName,
  type CrudTestContext,
} from '../../test/crud-helper'
import { authenticatedRequest } from '../../test/hono-helper'

let ctx: CrudTestContext

function isIsoString(v: unknown): boolean {
  if (typeof v !== 'string') return false
  return !isNaN(Date.parse(v))
}

const validProvider = {
  name: 'Test Provider',
  protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
}

describe('providers API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('GET /api/providers without auth returns 401', async () => {
    const res = await unauthGet(ctx, '/api/providers')
    expect(res.status).toBe(401)
  })

  it('GET /api/providers with auth returns 200 and empty list', async () => {
    const res = await authGet(ctx, '/api/providers')
    const { status, body } = await parseJson<unknown[]>(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.total).toBe(0)
  })

  it('POST /api/providers with valid data returns 201 with deep field checks', async () => {
    const name = uniqueName('provider')
    const res = await authPost(ctx, '/api/providers', {
      name,
      protocols: validProvider.protocols,
    })
    const { status, body } = await parseJson<{
      id: string
      name: string
      apiKey: string | null
      protocols: Record<string, { baseUrl: string; enabled: boolean }>
      enabled: boolean
      createdAt: string
      updatedAt: string
    }>(res)

    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe(name)
    expect(body.data.protocols).toBeDefined()
    expect(body.data.protocols.openai).toBeDefined()
    expect(body.data.protocols.openai.baseUrl).toBe('https://api.openai.com')
    expect(body.data.protocols.openai.enabled).toBe(true)
    expect(typeof body.data.enabled).toBe('boolean')
    expect(body.data.enabled).toBe(true)
    expect(isIsoString(body.data.createdAt)).toBe(true)
    expect(isIsoString(body.data.updatedAt)).toBe(true)
    expect(body.data.apiKey).toBeNull()
  })

  it('POST /api/providers with apiKey returns provider with apiKey', async () => {
    const name = uniqueName('provider-with-key')
    const res = await authPost(ctx, '/api/providers', {
      name,
      protocols: validProvider.protocols,
      apiKey: 'sk-test-secret-key',
    })
    const { status, body } = await parseJson<{
      apiKey: string | null
    }>(res)

    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.apiKey).toBe('sk-test-secret-key')
  })

  it('POST /api/providers with missing fields returns 400', async () => {
    const res = await authPost(ctx, '/api/providers', {})
    const { status, body } = await parseJson(res)

    expect(status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/providers with anthropic protocol returns correct structure', async () => {
    const name = uniqueName('provider-anthropic')
    const res = await authPost(ctx, '/api/providers', {
      name,
      protocols: {
        openai: { baseUrl: 'https://api.openai.com', enabled: true },
        anthropic: { baseUrl: 'https://api.anthropic.com', enabled: true },
      },
    })
    const { status, body } = await parseJson<{
      protocols: Record<string, { baseUrl: string; enabled: boolean }>
    }>(res)

    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.protocols.openai).toBeDefined()
    expect(body.data.protocols.anthropic).toBeDefined()
    expect(body.data.protocols.anthropic.baseUrl).toBe('https://api.anthropic.com')
    expect(body.data.protocols.anthropic.enabled).toBe(true)
  })

  it('GET /api/providers/:id returns 200 with correct data', async () => {
    const name = uniqueName('provider-for-get')
    const createRes = await authPost(ctx, '/api/providers', {
      name,
      protocols: { openai: { baseUrl: 'https://api.example.com', enabled: true } },
    })
    const { body: createBody } = await parseJson<{ id: string }>(createRes)

    const res = await authGet(ctx, `/api/providers/${createBody.data.id}`)
    const { status, body } = await parseJson<{ id: string; name: string }>(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe(createBody.data.id)
    expect(body.data.name).toBe(name)
  })

  it('GET /api/providers/:id nonexistent returns 404 with PROVIDER_NOT_FOUND', async () => {
    const res = await authGet(ctx, '/api/providers/00000000-0000-0000-0000-000000000000')
    const { status, body } = await parseJson(res)

    expect(status).toBe(404)
    expect(body.code).toBe('PROVIDER_NOT_FOUND')
  })

  it('PUT /api/providers/:id returns 200', async () => {
    const name = uniqueName('provider-for-update')
    const createRes = await authPost(ctx, '/api/providers', {
      name,
      protocols: { openai: { baseUrl: 'https://api.example.com', enabled: true } },
    })
    const { body: createBody } = await parseJson<{ id: string }>(createRes)

    const res = await authPut(ctx, `/api/providers/${createBody.data.id}`, {
      name: 'Updated Provider',
    })
    const { status, body } = await parseJson<{ name: string }>(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Updated Provider')
  })

  it('DELETE /api/providers/:id returns 200', async () => {
    const name = uniqueName('provider-for-delete')
    const createRes = await authPost(ctx, '/api/providers', {
      name,
      protocols: { openai: { baseUrl: 'https://api.example.com', enabled: true } },
    })
    const { body: createBody } = await parseJson<{ id: string }>(createRes)

    const res = await authDelete(ctx, `/api/providers/${createBody.data.id}`)
    const { status, body } = await parseJson(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('DELETE /api/providers/:nonexistent returns 404', async () => {
    const res = await authDelete(ctx, '/api/providers/00000000-0000-0000-0000-000000000000')
    const { status, body } = await parseJson(res)

    expect(status).toBe(404)
    expect(body.code).toBe('PROVIDER_NOT_FOUND')
  })

  it('PATCH /api/providers/:id/toggle flips enabled state', async () => {
    const name = uniqueName('provider-for-toggle')
    const createRes = await authPost(ctx, '/api/providers', {
      name,
      protocols: { openai: { baseUrl: 'https://api.example.com', enabled: true } },
    })
    const { body: createBody } = await parseJson<{ id: string; enabled: boolean }>(createRes)
    expect(createBody.data.enabled).toBe(true)

    const toggleRes = await authenticatedRequest(
      ctx.app,
      'PATCH',
      `/api/providers/${createBody.data.id}/toggle`,
      ctx.token,
    )
    const { status: toggleStatus, body: toggleBody } = await parseJson<{ enabled: boolean }>(
      toggleRes,
    )

    expect(toggleStatus).toBe(200)
    expect(toggleBody.success).toBe(true)
    expect(toggleBody.data.enabled).toBe(false)

    const toggleRes2 = await authenticatedRequest(
      ctx.app,
      'PATCH',
      `/api/providers/${createBody.data.id}/toggle`,
      ctx.token,
    )
    const { status: toggleStatus2, body: toggleBody2 } = await parseJson<{ enabled: boolean }>(
      toggleRes2,
    )

    expect(toggleStatus2).toBe(200)
    expect(toggleBody2.success).toBe(true)
    expect(toggleBody2.data.enabled).toBe(true)
  })
})

describe('providers API - POST / (create)', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('creates a provider with valid data and returns 201', async () => {
    const res = await authPost(ctx, '/api/providers', {
      ...validProvider,
      name: uniqueName('create'),
    })
    const { status, body } = await parseJson<{ id: string; name: string }>(res)
    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.name).toMatch(/^create-/)
  })
})

describe('providers API - PUT /:id (update)', () => {
  let createdId: string

  beforeAll(async () => {
    ctx = await setupCrudTest()
    const res = await authPost(ctx, '/api/providers', {
      ...validProvider,
      name: uniqueName('upd'),
    })
    const { body } = await parseJson<{ id: string }>(res)
    createdId = body.data.id
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('updates an existing provider', async () => {
    const res = await authPut(ctx, `/api/providers/${createdId}`, {
      name: 'updated-name',
    })
    const { status, body } = await parseJson<{ name: string }>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('updated-name')
  })
})

describe('providers API - DELETE /:id', () => {
  let createdId: string

  beforeAll(async () => {
    ctx = await setupCrudTest()
    const res = await authPost(ctx, '/api/providers', {
      ...validProvider,
      name: uniqueName('del'),
    })
    const { body } = await parseJson<{ id: string }>(res)
    createdId = body.data.id
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('deletes an existing provider', async () => {
    const res = await authDelete(ctx, `/api/providers/${createdId}`)
    expect(res.status).toBe(200)
  })
})
