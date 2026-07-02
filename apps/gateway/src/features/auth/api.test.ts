import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  setupCrudTest,
  teardownCrudTest,
  authPost,
  authGet,
  unauthGet,
  type CrudTestContext,
} from '../../test/crud-helper'
import { testRequest } from '../../test/hono-helper'

let ctx: CrudTestContext

describe('auth API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('POST /api/auth/login with correct password returns 200 and token', async () => {
    const res = await testRequest(ctx.app, 'POST', '/api/auth/login', {
      body: { password: 'test' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; token: string; expiresIn: number }

    expect(body.success).toBe(true)
    expect(typeof body.token).toBe('string')
    expect(body.token.split('.').length).toBe(3)
    expect(body.expiresIn).toBe(604800)
  })

  it('POST /api/auth/login with wrong password returns 401', async () => {
    const res = await testRequest(ctx.app, 'POST', '/api/auth/login', {
      body: { password: 'wrong' },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; code: string }

    expect(body.error).toBe('Invalid password')
    expect(body.code).toBe('INVALID_CREDENTIALS')
  })

  it('POST /api/auth/login with no password returns 401', async () => {
    const res = await testRequest(ctx.app, 'POST', '/api/auth/login', { body: {} })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; code: string }

    expect(body.error).toBe('Invalid password')
  })

  it('POST /api/auth/login with empty body (no password field) returns 401', async () => {
    const res = await testRequest(ctx.app, 'POST', '/api/auth/login', {
      headers: { 'Content-Type': 'application/json' },
      body: {},
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; code: string }

    expect(body.code).toBe('INVALID_CREDENTIALS')
  })

  it('GET /api/auth/me with valid token returns 200', async () => {
    const res = await authGet(ctx, '/api/auth/me')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { role: string; authenticated: boolean }

    expect(body.role).toBe('admin')
    expect(body.authenticated).toBe(true)
  })

  it('GET /api/auth/me without token returns 401', async () => {
    const res = await unauthGet(ctx, '/api/auth/me')
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; code: string }

    expect(body.error).toBe('Missing or invalid authorization header')
    expect(body.code).toBe('UNAUTHORIZED')
  })

  it('GET /api/auth/me with invalid token returns 401', async () => {
    const res = await testRequest(ctx.app, 'GET', '/api/auth/me', {
      headers: { Authorization: 'Bearer invalid-token' },
    })
    expect(res.status).toBe(401)
    const body = (await res.json()) as { error: string; code: string }

    expect(body.error).toBe('Invalid or expired token')
    expect(body.code).toBe('INVALID_TOKEN')
  })

  it('POST /api/auth/logout with valid token returns 200', async () => {
    const res = await authPost(ctx, '/api/auth/logout')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean; message: string }

    expect(body.success).toBe(true)
    expect(body.message).toBe('Logged out successfully')
  })
})
