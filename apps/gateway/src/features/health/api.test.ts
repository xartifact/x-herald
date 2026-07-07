import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { Hono } from 'hono'
import { createTestEngine, destroyTestEngine } from '../../test/setup'

let app: Hono

describe('health API', () => {
  beforeAll(async () => {
    const engine = await createTestEngine()
    app = engine.app
  })

  afterAll(async () => {
    await destroyTestEngine()
  })

  it('GET /api/health returns 200 with healthy status', async () => {
    const res = await app.request('/api/health')
    expect(res.status).toBe(200)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.status).toBe('healthy')
    expect(data.version).toBeDefined()
    expect(data.uptime).toBeDefined()
    expect(data.database).toBe('connected')
    expect(data.timestamp).toBeDefined()
  })

  it('GET /api/health/ready returns 200 with ready status', async () => {
    const res = await app.request('/api/health/ready')
    expect(res.status).toBe(200)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.status).toBe('ready')
    expect(data.timestamp).toBeDefined()
  })

  it('GET /api/health/live returns 200 with alive status', async () => {
    const res = await app.request('/api/health/live')
    expect(res.status).toBe(200)
    const data = (await res.json()) as Record<string, unknown>
    expect(data.status).toBe('alive')
    expect(data.timestamp).toBeDefined()
  })
})
