import { describe, it, expect, beforeAll, afterAll, mock } from 'bun:test'
import {
  setupCrudTest,
  teardownCrudTest,
  authGet,
  authPut,
  authPost,
  uniqueName,
} from '../../test/crud-helper'
import type { CrudTestContext } from '../../test/crud-helper'

// Override any leaked mock.module for db/client that may persist across files
const realDbClient = await import('../../db/client')
const originalGetDatabase = realDbClient.getDatabase
mock.module('../../db/client', () => ({
  getDatabase: originalGetDatabase,
  closeDatabase: realDbClient.closeDatabase,
  createDatabase: realDbClient.createDatabase,
  schema: realDbClient.schema,
}))

let ctx: CrudTestContext

describe('settings API', () => {
  beforeAll(async () => {
    mock.restore()
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
    mock.restore()
  })

  describe('GET /', () => {
    it('returns 200 with settings data', async () => {
      const res = await authGet(ctx, '/api/settings')
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        success: boolean
        data: {
          aiModelGroupId: string | null
          availableModelGroups: unknown[]
          circuitBreaker: Record<string, unknown>
          ttfbTimeout: Record<string, unknown>
        }
      }

      expect(body.success).toBe(true)
      expect(body.data).toHaveProperty('aiModelGroupId')
      expect(body.data).toHaveProperty('availableModelGroups')
      expect(body.data).toHaveProperty('circuitBreaker')
      expect(body.data).toHaveProperty('ttfbTimeout')
      expect(Array.isArray(body.data.availableModelGroups)).toBe(true)
      expect(body.data.circuitBreaker).toHaveProperty('failureThreshold')
      expect(body.data.circuitBreaker).toHaveProperty('openDurationMs')
      expect(body.data.circuitBreaker).toHaveProperty('maxBackoffMs')
      expect(body.data.circuitBreaker).toHaveProperty('maxTripsBeforeCooldown')
      expect(body.data.circuitBreaker).toHaveProperty('cooldownDurationMs')
      expect(body.data.ttfbTimeout).toHaveProperty('totalStreamingMs')
      expect(body.data.ttfbTimeout).toHaveProperty('attemptStreamingMs')
      expect(body.data.ttfbTimeout).toHaveProperty('minAttemptMs')
      expect(body.data.ttfbTimeout).toHaveProperty('baselineMultiplier')
    })
  })

  describe('PUT / aiModelGroupId', () => {
    it('updates aiModelGroupId to a valid model group ID', async () => {
      const groupName = uniqueName('settings-group')
      const createRes = await authPost(ctx, '/api/model-groups', {
        name: groupName,
        displayName: 'Settings Test Group',
        category: 'chat',
        supportedProtocols: ['openai'],
        enabled: true,
      })
      expect(createRes.status).toBe(201)

      const createBody = (await createRes.json()) as { data: { id: string } }
      const groupId = createBody.data.id

      const res = await authPut(ctx, '/api/settings', { aiModelGroupId: groupId })
      expect(res.status).toBe(200)

      const body = (await res.json()) as { success: boolean }
      expect(body.success).toBe(true)

      // Verify via GET
      const getRes = await authGet(ctx, '/api/settings')
      const getBody = (await getRes.json()) as { data: { aiModelGroupId: string } }
      expect(getBody.data.aiModelGroupId).toBe(groupId)
    })

    it('returns 500 when clearing aiModelGroupId due to DB NOT NULL constraint', async () => {
      const res = await authPut(ctx, '/api/settings', { aiModelGroupId: null })
      expect(res.status).toBe(500)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('Failed query')
    })

    it('returns 404 when model group ID does not exist', async () => {
      const res = await authPut(ctx, '/api/settings', {
        aiModelGroupId: '00000000-0000-0000-0000-000000000000',
      })
      expect(res.status).toBe(404)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toBe('Model group not found')
    })

    it('returns 200 when neither field is present in body', async () => {
      const res = await authPut(ctx, '/api/settings', {})
      expect(res.status).toBe(200)

      const body = (await res.json()) as { success: boolean }
      expect(body.success).toBe(true)
    })
  })

  describe('PUT / circuit breaker validation', () => {
    it('returns 400 when failureThreshold < 1', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 0, openDurationMs: 1000 },
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('failureThreshold')
    })

    it('returns 400 when failureThreshold > 100', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 101, openDurationMs: 1000 },
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('failureThreshold')
    })

    it('returns 400 when openDurationMs < 1000', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 1, openDurationMs: 999 },
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('openDurationMs')
    })

    it('returns 400 when openDurationMs > 3600000', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 1, openDurationMs: 3600001 },
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('openDurationMs')
    })

    it('returns 400 when maxBackoffMs is invalid', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 1, openDurationMs: 1000, maxBackoffMs: 999 },
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('maxBackoffMs')
    })

    it('returns 400 when maxTripsBeforeCooldown < 2', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 1, openDurationMs: 1000, maxTripsBeforeCooldown: 1 },
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('maxTripsBeforeCooldown')
    })

    it('returns 400 when maxTripsBeforeCooldown > 20', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 1, openDurationMs: 1000, maxTripsBeforeCooldown: 21 },
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('maxTripsBeforeCooldown')
    })

    it('returns 400 when cooldownDurationMs < 60000', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 1, openDurationMs: 1000, cooldownDurationMs: 59999 },
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('cooldownDurationMs')
    })

    it('returns 400 when cooldownDurationMs > 7200000', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 1, openDurationMs: 1000, cooldownDurationMs: 7200001 },
      })
      expect(res.status).toBe(400)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
      expect(body.error).toContain('cooldownDurationMs')
    })
  })

  describe('PUT / circuit breaker success', () => {
    it('saves valid CB config with all fields', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: {
          failureThreshold: 5,
          openDurationMs: 120000,
          maxBackoffMs: 300000,
          maxTripsBeforeCooldown: 10,
          cooldownDurationMs: 3600000,
        },
      })
      expect(res.status).toBe(200)

      const body = (await res.json()) as { success: boolean }
      expect(body.success).toBe(true)

      // Verify via GET
      const getRes = await authGet(ctx, '/api/settings')
      const getBody = (await getRes.json()) as { data: { circuitBreaker: Record<string, unknown> } }
      expect(getBody.data.circuitBreaker.failureThreshold).toBe(5)
      expect(getBody.data.circuitBreaker.openDurationMs).toBe(120000)
      expect(getBody.data.circuitBreaker.maxBackoffMs).toBe(300000)
      expect(getBody.data.circuitBreaker.maxTripsBeforeCooldown).toBe(10)
      expect(getBody.data.circuitBreaker.cooldownDurationMs).toBe(3600000)
    })

    it('saves valid CB config with optional fields omitted', async () => {
      const res = await authPut(ctx, '/api/settings', {
        circuitBreaker: { failureThreshold: 1, openDurationMs: 1000 },
      })
      expect(res.status).toBe(200)

      const body = (await res.json()) as { success: boolean }
      expect(body.success).toBe(true)

      // Verify via GET
      const getRes = await authGet(ctx, '/api/settings')
      const getBody = (await getRes.json()) as { data: { circuitBreaker: Record<string, unknown> } }
      expect(getBody.data.circuitBreaker.failureThreshold).toBe(1)
      expect(getBody.data.circuitBreaker.openDurationMs).toBe(1000)
    })
  })

  describe('error handling', () => {
    it('returns 500 with invalid JSON body', async () => {
      const res = await ctx.app.request('/api/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.token}`,
        },
        body: 'not-json',
      })
      expect(res.status).toBe(500)

      const body = (await res.json()) as { success: boolean; error: string }
      expect(body.success).toBe(false)
    })
  })
})
