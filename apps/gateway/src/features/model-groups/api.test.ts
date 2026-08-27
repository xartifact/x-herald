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

interface ModelGroup {
  id: string
  name: string
  displayName: string
  description: string | null
  category: string
  capabilities: {
    streaming: boolean
    functionCalling: boolean
    vision: boolean
    jsonMode: boolean
    maxTokens: number
    contextWindow: number
    [key: string]: unknown
  }
  supportedProtocols: string[]
  enabled: boolean
  aliases: string[] | null
  routingConfig: unknown
  metadata: unknown
  createdAt: string
  updatedAt: string
}

interface ModelInstance {
  id: string
  providerId: string
  name: string
  actualModelName: string
  description: string | null
  config: unknown
  weight: number
  priority: number
  costPer1kTokens: unknown
  healthCheckUrl: string | null
  enabled: boolean
  status: string | null
  lastCheckedAt: string | null
  metadata: unknown
  createdAt: string
  updatedAt: string
  groupIds: string[]
  groupId: string | null
}

interface Provider {
  id: string
  [key: string]: unknown
}

interface GroupDetail {
  group: ModelGroup
  instances: Array<{ instance: ModelInstance; provider: Provider }>
}

let ctx: CrudTestContext
let providerId: string

function isIsoString(val: unknown): val is string {
  return typeof val === 'string' && !isNaN(Date.parse(val))
}

describe('model-groups API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
    const res = await authPost(ctx, '/api/providers', {
      name: uniqueName('Provider'),
      protocols: { openai: { baseUrl: 'https://api.openai.com', enabled: true } },
    })
    const { body } = await parseJson<{ id: string }>(res)
    providerId = body.data.id
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('GET /api/model-groups without auth returns 401', async () => {
    const res = await unauthGet(ctx, '/api/model-groups')
    expect(res.status).toBe(401)
  })

  it('GET /api/model-groups with auth returns 200 and list', async () => {
    const res = await authGet(ctx, '/api/model-groups')
    const { status, body } = await parseJson<ModelGroup[]>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('POST /api/model-groups with valid data returns 201 with deep shape', async () => {
    const name = uniqueName('Group')
    const res = await authPost(ctx, '/api/model-groups', { name })
    const { status, body } = await parseJson<ModelGroup>(res)
    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBeDefined()
    expect(body.data.name).toBe(name)
    expect(body.data.displayName).toBe(name)
    expect(body.data.category).toBe('chat')

    const cap = body.data.capabilities
    expect(typeof cap).toBe('object')
    expect(cap).not.toBeNull()
    expect(typeof cap.streaming).toBe('boolean')
    expect(typeof cap.functionCalling).toBe('boolean')
    expect(typeof cap.vision).toBe('boolean')
    expect(typeof cap.jsonMode).toBe('boolean')
    expect(typeof cap.maxTokens).toBe('number')
    expect(typeof cap.contextWindow).toBe('number')

    expect(Array.isArray(body.data.supportedProtocols)).toBe(true)
    expect(body.data.supportedProtocols).toContain('openai')

    expect(typeof body.data.enabled).toBe('boolean')
    expect(body.data.enabled).toBe(true)
    expect(isIsoString(body.data.createdAt)).toBe(true)
    expect(isIsoString(body.data.updatedAt)).toBe(true)
  })

  it('GET /api/model-groups/instances returns 200', async () => {
    const res = await authGet(ctx, '/api/model-groups/instances')
    const { status, body } = await parseJson<ModelInstance[]>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(Array.isArray(body.data)).toBe(true)
  })

  it('POST /api/model-groups/instances with valid data returns 201 with deep shape', async () => {
    const groupRes = await authPost(ctx, '/api/model-groups', { name: uniqueName('Grp-Inst') })
    const groupBody = await parseJson<{ id: string }>(groupRes)
    const groupId = groupBody.body.data.id

    const actualModelName = 'gpt-4o'
    const res = await authPost(ctx, '/api/model-groups/instances', {
      providerId,
      name: uniqueName('Instance'),
      actualModelName,
      groupId,
    })
    const { status, body } = await parseJson<ModelInstance>(res)
    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.id).toBeDefined()
    expect(body.data.actualModelName).toBe(actualModelName)
    expect(typeof body.data.weight).toBe('number')
    expect(body.data.weight).toBe(100)
    expect(typeof body.data.enabled).toBe('boolean')
    expect(body.data.enabled).toBe(true)
    expect(Array.isArray(body.data.groupIds)).toBe(true)
  })

  it('GET /api/model-groups/:id returns group detail with instances and providers', async () => {
    const groupRes = await authPost(ctx, '/api/model-groups', { name: uniqueName('Grp-Detail') })
    const groupBody = await parseJson<{ id: string }>(groupRes)
    const groupId = groupBody.body.data.id

    const instRes = await authPost(ctx, '/api/model-groups/instances', {
      providerId,
      name: uniqueName('Inst-Detail'),
      actualModelName: 'gpt-4o',
      groupId,
    })
    const instBody = await parseJson<{ id: string }>(instRes)

    const detailRes = await authGet(ctx, `/api/model-groups/${groupId}`)
    const { status, body } = await parseJson<GroupDetail>(detailRes)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.group.id).toBe(groupId)
    expect(Array.isArray(body.data.instances)).toBe(true)
    if (body.data.instances.length > 0) {
      const entry = body.data.instances[0]
      expect(entry.instance).toBeDefined()
      expect(entry.provider).toBeDefined()
      expect(typeof entry.provider.id).toBe('string')
    }
  })

  it('PATCH /api/model-groups/:id/toggle flips enabled', async () => {
    const createRes = await authPost(ctx, '/api/model-groups', { name: uniqueName('Grp-Toggle') })
    const createBody = await parseJson<ModelGroup>(createRes)
    const id = createBody.body.data.id
    const originalEnabled = createBody.body.data.enabled

    const toggleRes = await authenticatedRequest(
      ctx.app,
      'PATCH',
      `/api/model-groups/${id}/toggle`,
      ctx.token,
    )
    const { status, body } = await parseJson<ModelGroup>(toggleRes)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.enabled).toBe(!originalEnabled)
  })

  it('PUT /api/model-groups/instances/:id returns 200', async () => {
    const groupRes = await authPost(ctx, '/api/model-groups', { name: uniqueName('Grp-Upd') })
    const groupBody = await parseJson<{ id: string }>(groupRes)
    const groupId = groupBody.body.data.id

    const createRes = await authPost(ctx, '/api/model-groups/instances', {
      providerId,
      name: uniqueName('Inst-Upd'),
      actualModelName: 'gpt-4o',
      groupId,
    })
    const createBody = await parseJson<{ id: string }>(createRes)
    const id = createBody.body.data.id

    const res = await authPut(ctx, `/api/model-groups/instances/${id}`, {
      name: 'Updated Instance',
    })
    const { status, body } = await parseJson<ModelInstance>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Updated Instance')
  })

  it('DELETE /api/model-groups/instances/:id returns 200', async () => {
    const groupRes = await authPost(ctx, '/api/model-groups', { name: uniqueName('Grp-Del') })
    const groupBody = await parseJson<{ id: string }>(groupRes)
    const groupId = groupBody.body.data.id

    const createRes = await authPost(ctx, '/api/model-groups/instances', {
      providerId,
      name: uniqueName('Inst-Del'),
      actualModelName: 'gpt-4o',
      groupId,
    })
    const createBody = await parseJson<{ id: string }>(createRes)
    const id = createBody.body.data.id

    const res = await authDelete(ctx, `/api/model-groups/instances/${id}`)
    const { status, body } = await parseJson<unknown>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('PUT /api/model-groups/:id returns 200', async () => {
    const createRes = await authPost(ctx, '/api/model-groups', { name: uniqueName('Grp-Put') })
    const createBody = await parseJson<{ id: string }>(createRes)
    const id = createBody.body.data.id

    const res = await authPut(ctx, `/api/model-groups/${id}`, { name: 'Updated Group' })
    const { status, body } = await parseJson<ModelGroup>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
    expect(body.data.name).toBe('Updated Group')
  })

  it('DELETE /api/model-groups/:id returns 200', async () => {
    const createRes = await authPost(ctx, '/api/model-groups', { name: uniqueName('Grp-Rm') })
    const createBody = await parseJson<{ id: string }>(createRes)
    const id = createBody.body.data.id

    const res = await authDelete(ctx, `/api/model-groups/${id}`)
    const { status, body } = await parseJson<unknown>(res)
    expect(status).toBe(200)
    expect(body.success).toBe(true)
  })

  it('GET /api/model-groups/:id nonexistent returns 404', async () => {
    const res = await authGet(ctx, '/api/model-groups/00000000-0000-0000-0000-000000000000')
    const { status, body } = await parseJson<unknown>(res)
    expect(status).toBe(404)
    expect(body.success).toBe(false)
  })
})
