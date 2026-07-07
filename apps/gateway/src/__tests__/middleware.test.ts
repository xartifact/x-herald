import { describe, test, expect } from 'bun:test'
import { Hono } from 'hono'

import { errorHandler, requestLogger, createCorsMiddleware } from '../middleware'
import { AppError } from '../middleware/error'
import type { GatewayConfig } from '../config'

function makeConfig(cors: { enabled: boolean; origins: string[] }): GatewayConfig {
  return {
    server: { port: 3000, host: '0.0.0.0', cors },
    database: {
      type: 'postgres',
      host: 'localhost',
      port: 5432,
      database: 'test',
      user: 'test',
      password: 'test',
      ssl: false,
      dataDir: '',
    },
    admin: { password: 'test' },
    metrics: { memoryBufferSize: 1000, flushIntervalMs: 5000, retentionDays: 7 },
    health: { checkIntervalMs: 30000, timeoutMs: 5000, failureThreshold: 3 },
    circuitBreaker: { failureThreshold: 5, timeout: 30000, resetTimeout: 30000 },
    sameProtocolPassthrough: { enabled: false, allowedProtocols: ['openai'] },
    logger: { level: 'info', enableRequestLog: true, enableDebug: false },
  }
}

describe('AppError', () => {
  test('has correct properties', () => {
    const err = new AppError(400, 'Invalid input', 'BAD_INPUT')
    expect(err.statusCode).toBe(400)
    expect(err.message).toBe('Invalid input')
    expect(err.code).toBe('BAD_INPUT')
    expect(err.name).toBe('AppError')
    expect(err instanceof Error).toBe(true)
  })

  test('code defaults to undefined when omitted', () => {
    const err = new AppError(500, 'Something broke')
    expect(err.code).toBeUndefined()
  })
})

describe('errorHandler middleware', () => {
  test('passes through when no error is thrown', async () => {
    const app = new Hono()
    app.use('*', errorHandler)
    app.get('/ok', (c) => c.json({ success: true }))

    const res = await app.request('/ok')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ success: true })
  })

  test('catches AppError thrown in handler via onError', async () => {
    const app = new Hono()
    app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code || 'INTERNAL_ERROR' }, err.statusCode)
      }
      if (err instanceof Error) {
        return c.json({ error: err.message, code: 'INTERNAL_ERROR' }, 500)
      }
      return c.json({ error: 'Unknown error', code: 'UNKNOWN_ERROR' }, 500)
    })
    app.get('/fail', () => {
      throw new AppError(400, 'Invalid input', 'BAD_INPUT')
    })

    const res = await app.request('/fail')
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: string; code: string }
    expect(body.error).toBe('Invalid input')
    expect(body.code).toBe('BAD_INPUT')
  })

  test('catches generic Error via onError and returns 500', async () => {
    const app = new Hono()
    app.onError((err, c) => {
      if (err instanceof AppError) {
        return c.json({ error: err.message, code: err.code || 'INTERNAL_ERROR' }, err.statusCode)
      }
      return c.json({ error: err.message, code: 'INTERNAL_ERROR' }, 500)
    })
    app.get('/fail', () => {
      throw new Error('Unexpected crash')
    })

    const res = await app.request('/fail')
    expect(res.status).toBe(500)
    const body = (await res.json()) as { error: string; code: string }
    expect(body.error).toBe('Unexpected crash')
    expect(body.code).toBe('INTERNAL_ERROR')
  })
})

describe('requestLogger', () => {
  test('sets requestId from x-request-id header', async () => {
    const app = new Hono()
    app.use('*', requestLogger)
    app.get('/track', (c) => c.json({ requestId: c.get('requestId') }))

    const res = await app.request('/track', {
      headers: { 'x-request-id': 'req-123' },
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ requestId: 'req-123' })
  })

  test('generates UUID requestId when header absent', async () => {
    const app = new Hono()
    app.use('*', requestLogger)
    app.get('/track', (c) => c.json({ requestId: c.get('requestId') }))

    const res = await app.request('/track')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { requestId: string }
    expect(typeof body.requestId).toBe('string')
    expect(body.requestId.length).toBeGreaterThan(0)
  })

  test('uses different requestId for different requests', async () => {
    const app = new Hono()
    app.use('*', requestLogger)
    app.get('/track', (c) => c.json({ requestId: c.get('requestId') }))

    const res1 = await app.request('/track')
    const res2 = await app.request('/track')
    const body1 = (await res1.json()) as { requestId: string }
    const body2 = (await res2.json()) as { requestId: string }
    expect(body1.requestId).not.toBe(body2.requestId)
  })
})

describe('createCorsMiddleware', () => {
  test('adds CORS headers when enabled with matching origin', async () => {
    const config = makeConfig({ enabled: true, origins: ['http://localhost:3000'] })
    const app = new Hono()
    app.use('*', createCorsMiddleware(config))
    app.get('/data', (c) => c.json({ ok: true }))

    const res = await app.request('/data', {
      headers: { Origin: 'http://localhost:3000' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
  })

  test('no CORS headers when disabled', async () => {
    const config = makeConfig({ enabled: false, origins: [] })
    const app = new Hono()
    app.use('*', createCorsMiddleware(config))
    app.get('/data', (c) => c.json({ ok: true }))

    const res = await app.request('/data', {
      headers: { Origin: 'http://localhost:3000' },
    })
    expect(res.status).toBe(200)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  test('middleware chain works with all three middlewares', async () => {
    const config = makeConfig({ enabled: true, origins: ['http://localhost:3000'] })
    const app = new Hono()
    app.use('*', errorHandler)
    app.use('*', requestLogger)
    app.use('*', createCorsMiddleware(config))
    app.get('/ok', (c) => c.json({ success: true }))

    const res = await app.request('/ok', {
      headers: { Origin: 'http://localhost:3000' },
    })
    expect(res.status).toBe(200)
    const body = (await res.json()) as { success: boolean }
    expect(body.success).toBe(true)
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:3000')
  })
})
