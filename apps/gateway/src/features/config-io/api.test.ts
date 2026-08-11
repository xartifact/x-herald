import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import {
  setupCrudTest,
  teardownCrudTest,
  authGet,
  authPost,
  unauthGet,
  uniqueName,
} from '../../test/crud-helper'
import { testRequest } from '../../test/hono-helper'

import type { CrudTestContext } from '../../test/crud-helper'

let ctx: CrudTestContext

const emptyExportData = {
  providers: [],
  modelGroups: [],
  modelInstances: [],
  accessModels: [],
  virtualModels: [],
  virtualKeys: [],
  gatewayConfigs: [],
}

function makeImportBody(data: Record<string, unknown> = emptyExportData) {
  return { version: '2', data }
}

describe('config-io API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  describe('GET /api/config/export', () => {
    it('returns 401 without auth token', async () => {
      const res = await unauthGet(ctx, '/api/config/export')
      expect(res.status).toBe(401)
    })

    it('returns 200 with valid export shape on empty database', async () => {
      const res = await authGet(ctx, '/api/config/export')
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        version: string
        exportedAt: string
        data: Record<string, unknown[]>
      }

      expect(body.version).toBe('2')
      expect(typeof body.exportedAt).toBe('string')
      expect(new Date(body.exportedAt).toISOString()).toBe(body.exportedAt)

      const data = body.data
      expect(Array.isArray(data.providers)).toBe(true)
      expect(Array.isArray(data.modelGroups)).toBe(true)
      expect(Array.isArray(data.modelInstances)).toBe(true)
      expect(Array.isArray(data.virtualKeys)).toBe(true)
      expect(Array.isArray(data.gatewayConfigs)).toBe(true)

      expect(data.providers).toHaveLength(0)
      expect(data.modelGroups).toHaveLength(0)
      expect(data.modelInstances).toHaveLength(0)
      expect(data.virtualKeys).toHaveLength(0)
      expect(data.gatewayConfigs).toHaveLength(0)
    })

    it('includes Content-Disposition attachment header', async () => {
      const res = await authGet(ctx, '/api/config/export')
      expect(res.status).toBe(200)
      const disposition = res.headers.get('Content-Disposition')
      expect(disposition).not.toBeNull()
      expect(disposition).toContain('attachment')
      expect(disposition).toContain('x-llm-gateway-config')
      expect(disposition).toContain('.json')
    })

    it('includes created resources after seeding provider + model group + key', async () => {
      const providerName = uniqueName('export-provider')
      const createProviderRes = await authPost(ctx, '/api/providers', {
        name: providerName,
        protocols: { openai: { baseUrl: 'https://api.example.com', enabled: true } },
      })
      expect(createProviderRes.status).toBe(201)

      const groupName = uniqueName('export-group')
      const createGroupRes = await authPost(ctx, '/api/model-groups', {
        name: groupName,
        displayName: 'Export Test Group',
        category: 'chat',
        supportedProtocols: ['openai'],
        enabled: true,
      })
      expect(createGroupRes.status).toBe(201)

      const keyName = uniqueName('export-key')
      const createKeyRes = await authPost(ctx, '/api/keys', {
        name: keyName,
      })
      expect(createKeyRes.status).toBe(201)

      const res = await authGet(ctx, '/api/config/export')
      expect(res.status).toBe(200)
      const body = (await res.json()) as {
        version: string
        data: {
          providers: { name: string }[]
          modelGroups: { name: string }[]
          virtualKeys: { name: string }[]
        }
      }

      expect(body.data.providers.length).toBeGreaterThanOrEqual(1)
      expect(body.data.providers.some((p) => p.name === providerName)).toBe(true)
      expect(body.data.modelGroups.length).toBeGreaterThanOrEqual(1)
      expect(body.data.modelGroups.some((g) => g.name === groupName)).toBe(true)
      expect(body.data.virtualKeys.length).toBeGreaterThanOrEqual(1)
      expect(body.data.virtualKeys.some((k) => k.name === keyName)).toBe(true)
    })
  })

  describe('POST /api/config/import', () => {
    it('returns 401 without auth token', async () => {
      const res = await testRequest(ctx.app, 'POST', '/api/config/import', {
        body: makeImportBody(),
      })
      expect(res.status).toBe(401)
    })

    it('returns 200 with success and all-zero summary for empty data import', async () => {
      const res = await authPost(ctx, '/api/config/import', makeImportBody())
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        success: boolean
        summary: Record<string, { created: number; updated: number; errors: number }>
        errors: string[]
      }

      expect(body.success).toBe(true)
      expect(body.errors).toHaveLength(0)

      expect(body.summary.providers.created).toBe(0)
      expect(body.summary.providers.updated).toBe(0)
      expect(body.summary.providers.errors).toBe(0)
      expect(body.summary.modelGroups.created).toBe(0)
      expect(body.summary.virtualKeys.created).toBe(0)
      expect(body.summary.gatewayConfigs.created).toBe(0)
    })

    it('returns 400 when version is missing', async () => {
      const res = await authPost(ctx, '/api/config/import', {
        data: emptyExportData,
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Unsupported export version')
    })

    it('returns 400 when version is wrong number', async () => {
      const res = await authPost(ctx, '/api/config/import', {
        version: 1,
        data: emptyExportData,
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Unsupported export version')
    })

    it('returns 400 when data field is missing', async () => {
      const res = await authPost(ctx, '/api/config/import', {
        version: '2',
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Missing data field')
    })

    it('returns 400 when data field is null', async () => {
      const res = await authPost(ctx, '/api/config/import', {
        version: '2',
        data: null,
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Missing data field')
    })

    it('returns 400 when parsed body is null', async () => {
      const res = await ctx.app.request('/api/config/import', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${ctx.token}`,
        },
        body: 'null',
      })
      expect(res.status).toBe(400)
      const body = (await res.json()) as { error: string }
      expect(body.error).toContain('Invalid JSON body')
    })

    it('imports a provider and shows created count in summary', async () => {
      const providerName = uniqueName('import-provider')
      const res = await authPost(ctx, '/api/config/import', {
        version: '2',
        data: {
          ...emptyExportData,
          providers: [
            {
              name: providerName,
              apiKey: 'sk-test-key',
              protocols: { openai: { baseUrl: 'https://api.example.com', enabled: true } },
              enabled: true,
            },
          ],
        },
      })
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        success: boolean
        summary: { providers: { created: number; updated: number; errors: number } }
      }

      expect(body.success).toBe(true)
      expect(body.summary.providers.created).toBe(1)
      expect(body.summary.providers.updated).toBe(0)
      expect(body.summary.providers.errors).toBe(0)
    })

    it('importing same config twice shows updated (not created)', async () => {
      const providerName = uniqueName('import-dup-provider')
      const importBody = {
        version: '2',
        data: {
          ...emptyExportData,
          providers: [
            {
              name: providerName,
              apiKey: 'sk-first',
              protocols: { openai: { baseUrl: 'https://api.example.com', enabled: true } },
              enabled: true,
            },
          ],
        },
      }

      const first = await authPost(ctx, '/api/config/import', importBody)
      expect(first.status).toBe(200)
      const firstBody = (await first.json()) as {
        summary: { providers: { created: number; updated: number } }
      }
      expect(firstBody.summary.providers.created).toBe(1)

      const second = await authPost(ctx, '/api/config/import', importBody)
      expect(second.status).toBe(200)
      const secondBody = (await second.json()) as {
        summary: { providers: { created: number; updated: number } }
      }
      expect(secondBody.summary.providers.updated).toBe(1)
      expect(secondBody.summary.providers.created).toBe(0)
    })
  })
})
