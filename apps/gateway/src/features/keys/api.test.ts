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

let ctx: CrudTestContext

function isIsoString(v: unknown): boolean {
  if (typeof v !== 'string') return false
  return !isNaN(Date.parse(v))
}

describe('keys API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('GET /api/keys without auth returns 401', async () => {
    const res = await unauthGet(ctx, '/api/keys')
    expect(res.status).toBe(401)
  })

  it('GET /api/keys with auth returns 200 and empty list', async () => {
    const res = await authGet(ctx, '/api/keys')
    const { status, body } = await parseJson<unknown[]>(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.total).toBe(0)
  })

  it('POST /api/keys with valid data returns 201 with deep field checks', async () => {
    const name = uniqueName('key')
    const res = await authPost(ctx, '/api/keys', { name })
    const { status, body } = await parseJson<{
      id: string
      key: string
      name: string
      rateLimitRpm: number | null
      rateLimitRpd: number | null
      tokenLimitDaily: string | null
      totalRequests: number
      totalTokens: string
      enabled: boolean
      createdAt: string
      updatedAt: string
    }>(res)

    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe(name)
    expect(body.data.key.startsWith('xg_')).toBe(true)
    expect(body.data.rateLimitRpm).toBeNull()
    expect(body.data.rateLimitRpd).toBeNull()
    expect(body.data.tokenLimitDaily).toBeNull()
    expect(body.data.totalRequests).toBe(0)
    expect(body.data.totalTokens).toBe('0')
    expect(body.data.enabled).toBe(true)
    expect(isIsoString(body.data.createdAt)).toBe(true)
    expect(isIsoString(body.data.updatedAt)).toBe(true)
  })

  it('POST /api/keys with missing name returns 400', async () => {
    const res = await authPost(ctx, '/api/keys', {})
    const { status, body } = await parseJson(res)

    expect(status).toBe(400)
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('POST /api/keys with rate limits returns configured values', async () => {
    const name = uniqueName('rate-limited')
    const res = await authPost(ctx, '/api/keys', {
      name,
      rateLimitRpm: 10,
      rateLimitRpd: 100,
      tokenLimitDaily: 10000,
    })
    const { status, body } = await parseJson<{
      id: string
      key: string
      name: string
      rateLimitRpm: number | null
      rateLimitRpd: number | null
      tokenLimitDaily: string | null
    }>(res)

    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.rateLimitRpm).toBe(10)
    expect(body.data.rateLimitRpd).toBe(100)
    expect(body.data.tokenLimitDaily).toBe('10000')
  })

  it('GET /api/keys/:id returns 200 with correct data', async () => {
    const name = uniqueName('key-for-get')
    const createRes = await authPost(ctx, '/api/keys', { name })
    const { body: createBody } = await parseJson<{ id: string }>(createRes)

    const res = await authGet(ctx, `/api/keys/${createBody.data.id}`)
    const { status, body } = await parseJson<{ id: string; name: string }>(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.id).toBe(createBody.data.id)
    expect(body.data.name).toBe(name)
  })

  it('GET /api/keys/:id nonexistent returns 404 with KEY_NOT_FOUND', async () => {
    const res = await authGet(ctx, '/api/keys/00000000-0000-0000-0000-000000000000')
    const { status, body } = await parseJson(res)

    expect(status).toBe(404)
    expect(body.code).toBe('KEY_NOT_FOUND')
  })

  it('PUT /api/keys/:id returns 200', async () => {
    const name = uniqueName('key-for-update')
    const createRes = await authPost(ctx, '/api/keys', { name })
    const { body: createBody } = await parseJson<{ id: string }>(createRes)

    const res = await authPut(ctx, `/api/keys/${createBody.data.id}`, { name: 'Updated Key' })
    const { status, body } = await parseJson<{ name: string }>(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Updated Key')
  })

  it('DELETE /api/keys/:id returns 200', async () => {
    const name = uniqueName('key-for-delete')
    const createRes = await authPost(ctx, '/api/keys', { name })
    const { body: createBody } = await parseJson<{ id: string }>(createRes)

    const res = await authDelete(ctx, `/api/keys/${createBody.data.id}`)
    const { status, body } = await parseJson(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('POST /api/keys/:id/reset returns 200 with new key', async () => {
    const name = uniqueName('key-for-reset')
    const createRes = await authPost(ctx, '/api/keys', { name })
    const { body: createBody } = await parseJson<{ id: string; key: string }>(createRes)
    const originalKey = createBody.data.key

    const res = await authPost(ctx, `/api/keys/${createBody.data.id}/reset`)
    const { status, body } = await parseJson<{ key: string }>(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.message).toBe('API key has been reset successfully')
    expect(body.data.key).not.toBe(originalKey)
    expect(body.data.key.startsWith('xg_')).toBe(true)
  })

  it('GET /api/keys/:id/usage returns 200 with keyId', async () => {
    const name = uniqueName('key-for-usage')
    const createRes = await authPost(ctx, '/api/keys', { name })
    const { body: createBody } = await parseJson<{ id: string }>(createRes)

    const res = await authGet(ctx, `/api/keys/${createBody.data.id}/usage`)
    const { status, body } = await parseJson<{ keyId: string }>(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.keyId).toBe(createBody.data.id)
  })

  it('GET /api/keys/:id/usage with rate limits returns rpm/rpd/token status', async () => {
    const name = uniqueName('key-for-usage-rl')
    const createRes = await authPost(ctx, '/api/keys', {
      name,
      rateLimitRpm: 10,
      rateLimitRpd: 100,
      tokenLimitDaily: 10000,
    })
    const { body: createBody } = await parseJson<{ id: string }>(createRes)

    const res = await authGet(ctx, `/api/keys/${createBody.data.id}/usage`)
    const { status, body } = await parseJson<{
      keyId: string
      rpm: { current: number; limit: number; remaining: number; resetAt: number }
      rpd: { current: number; limit: number; remaining: number; resetAt: number }
      token: { current: number; limit: number; remaining: number; resetAt: number }
    }>(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.keyId).toBe(createBody.data.id)
    expect(body.data.rpm).toBeDefined()
    expect(typeof body.data.rpm.current).toBe('number')
    expect(body.data.rpm.limit).toBe(10)
    expect(typeof body.data.rpm.remaining).toBe('number')
    expect(typeof body.data.rpm.resetAt).toBe('number')
    expect(body.data.rpd).toBeDefined()
    expect(body.data.rpd.limit).toBe(100)
    expect(body.data.token).toBeDefined()
    expect(body.data.token.limit).toBe(10000)
  })

  it('POST /api/keys/:id/reset-usage returns 200', async () => {
    const name = uniqueName('key-for-reset-usage')
    const createRes = await authPost(ctx, '/api/keys', { name })
    const { body: createBody } = await parseJson<{ id: string }>(createRes)

    const res = await authPost(ctx, `/api/keys/${createBody.data.id}/reset-usage`)
    const { status, body } = await parseJson(res)

    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.message).toContain('Rate limit counters reset')
  })
})
