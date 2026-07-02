import { describe, it, expect, beforeEach } from 'bun:test'
import { Hono } from 'hono'

import { requestLogger } from './logger'

describe('requestLogger middleware', () => {
  let app: Hono

  beforeEach(() => {
    app = new Hono()
    app.use('*', requestLogger)
  })

  it('uses x-request-id from request header when present', async () => {
    app.get('/test', (c) => {
      return c.json({ requestId: c.get('requestId' as any) })
    })

    const res = await app.request('/test', {
      headers: { 'x-request-id': 'trace-abc-123' },
    })
    const body = (await res.json()) as Record<string, unknown>

    expect(body.requestId).toBe('trace-abc-123')
  })

  it('generates a UUID when no x-request-id header is sent', async () => {
    app.get('/test', (c) => {
      return c.json({ requestId: c.get('requestId' as any) })
    })

    const res = await app.request('/test')
    const body = (await res.json()) as Record<string, unknown>

    expect(body.requestId).toBeTruthy()
    // UUID v4 format: 8-4-4-4-12 hex digits
    expect(body.requestId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  })

  it('sets requestId via c.set() accessible in downstream handlers', async () => {
    app.get('/echo', (c) => {
      return c.json({ rid: c.get('requestId' as any) })
    })

    const res = await app.request('/echo', {
      headers: { 'x-request-id': 'manual-trace' },
    })
    const body = (await res.json()) as Record<string, unknown>

    expect(body.rid).toBe('manual-trace')
  })
})
