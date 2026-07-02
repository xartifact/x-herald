import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { authenticatedRequest } from '../../test/hono-helper'
import {
  setupCrudTest,
  teardownCrudTest,
  parseJson,
  authGet,
  authPost,
  authPut,
  authDelete,
  uniqueName,
  unauthGet,
  type CrudTestContext,
} from '../../test/crud-helper'

interface AccessModel {
  id: string
  name: string
  displayName: string | null
  description: string | null
  enabled: boolean
  capabilities: Record<string, unknown> | null
  createdAt: string
  updatedAt: string
}

function isIsoString(val: unknown): val is string {
  return typeof val === 'string' && !isNaN(Date.parse(val))
}

function authPatch(c: CrudTestContext, path: string): Response | Promise<Response> {
  return authenticatedRequest(c.app, 'PATCH', path, c.token)
}

let ctx: CrudTestContext

describe('access-models API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('GET /api/access-models without auth returns 401', async () => {
    const res = await unauthGet(ctx, '/api/access-models')
    expect(res.status).toBe(401)
  })

  it('GET /api/access-models with auth returns 200 and list', async () => {
    const res = await authGet(ctx, '/api/access-models')
    const { status, body } = await parseJson<AccessModel[]>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('POST /api/access-models with valid data returns 201', async () => {
    const name = uniqueName('am')
    const res = await authPost(ctx, '/api/access-models', {
      name,
      displayName: 'Test Access Model',
      enabled: true,
      capabilities: {
        streaming: true,
        functionCalling: false,
        vision: false,
        jsonMode: false,
        maxTokens: 4096,
        contextWindow: 8192,
      },
    })
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBeDefined()
    expect(body.data.name).toBe(name)
    expect(body.data.displayName).toBe('Test Access Model')
    expect(typeof body.data.enabled).toBe('boolean')
    expect(body.data.enabled).toBe(true)
    expect(body.data.capabilities).not.toBeNull()
    expect(typeof body.data.capabilities!.streaming).toBe('boolean')
    expect(isIsoString(body.data.createdAt)).toBe(true)
    expect(isIsoString(body.data.updatedAt)).toBe(true)
  })

  it('POST /api/access-models with duplicate name returns error', async () => {
    const name = uniqueName('am-dup')
    await authPost(ctx, '/api/access-models', { name })
    const res = await authPost(ctx, '/api/access-models', { name })
    const { status, body } = await parseJson<AccessModel>(res)
    expect([409, 500]).toContain(status)
    expect(body.success).toBe(false)
  })

  it('GET /api/access-models/:id returns created access model', async () => {
    const name = uniqueName('am-get')
    const createRes = await authPost(ctx, '/api/access-models', { name, displayName: 'Get Me' })
    const createBody = await parseJson<AccessModel>(createRes)
    const id = createBody.body.data.id

    const res = await authGet(ctx, `/api/access-models/${id}`)
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe(id)
    expect(body.data.name).toBe(name)
    expect(body.data.displayName).toBe('Get Me')
  })

  it('PUT /api/access-models/:id updates displayName and enabled', async () => {
    const name = uniqueName('am-put')
    const createRes = await authPost(ctx, '/api/access-models', { name })
    const createBody = await parseJson<AccessModel>(createRes)
    const id = createBody.body.data.id

    const res = await authPut(ctx, `/api/access-models/${id}`, {
      displayName: 'Updated Name',
      enabled: false,
    })
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.displayName).toBe('Updated Name')
    expect(body.data.enabled).toBe(false)
  })

  it('PUT /api/access-models/:id on __catchall__ with name change returns 403', async () => {
    const listRes = await authGet(ctx, '/api/access-models')
    const listBody = await parseJson<AccessModel[]>(listRes)
    const catchall = listBody.body.data.find((am) => am.name === '__catchall__')
    if (!catchall) return

    const res = await authPut(ctx, `/api/access-models/${catchall.id}`, { name: 'renamed' })
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toContain('System access model name cannot be changed')
  })

  it('DELETE /api/access-models/:id works for custom access models', async () => {
    const name = uniqueName('am-del')
    const createRes = await authPost(ctx, '/api/access-models', { name })
    const createBody = await parseJson<AccessModel>(createRes)
    const id = createBody.body.data.id

    const res = await authDelete(ctx, `/api/access-models/${id}`)
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('DELETE /api/access-models/:id on __catchall__ returns 403', async () => {
    const listRes = await authGet(ctx, '/api/access-models')
    const listBody = await parseJson<AccessModel[]>(listRes)
    const catchall = listBody.body.data.find((am) => am.name === '__catchall__')
    if (!catchall) return

    const res = await authDelete(ctx, `/api/access-models/${catchall.id}`)
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(403)
    expect(body.success).toBe(false)
    expect(body.error).toContain('System access model cannot be deleted')
  })

  it('PATCH /api/access-models/:id/toggle flips enabled', async () => {
    const name = uniqueName('am-toggle')
    const createRes = await authPost(ctx, '/api/access-models', { name, enabled: true })
    const createBody = await parseJson<AccessModel>(createRes)
    const id = createBody.body.data.id
    const originalEnabled = createBody.body.data.enabled

    const res = await authPatch(ctx, `/api/access-models/${id}/toggle`)
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.enabled).toBe(!originalEnabled)
  })

  it('GET /api/access-models/:id nonexistent returns 404', async () => {
    const res = await authGet(ctx, '/api/access-models/00000000-0000-0000-0000-000000000000')
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(404)
    expect(body.success).toBe(false)
    expect(body.error).toContain('Access model not found')
  })

  it('PUT /api/access-models/:id nonexistent returns 404', async () => {
    const res = await authPut(ctx, '/api/access-models/00000000-0000-0000-0000-000000000000', {
      displayName: 'nope',
    })
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('DELETE /api/access-models/:id nonexistent returns 404', async () => {
    const res = await authDelete(ctx, '/api/access-models/00000000-0000-0000-0000-000000000000')
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(404)
    expect(body.success).toBe(false)
  })

  it('PATCH /api/access-models/:id/toggle nonexistent returns 404', async () => {
    const res = await authPatch(
      ctx,
      '/api/access-models/00000000-0000-0000-0000-000000000000/toggle',
    )
    const { status, body } = await parseJson<AccessModel>(res)
    expect(status).toBe(404)
    expect(body.success).toBe(false)
  })
})
