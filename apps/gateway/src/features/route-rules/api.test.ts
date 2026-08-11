import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  setupCrudTest,
  teardownCrudTest,
  parseJson,
  authGet,
  authPost,
  authDelete,
  type CrudTestContext,
} from '../../test/crud-helper'
import { authenticatedRequest } from '../../test/hono-helper'
import { getDatabase } from '../../db/client'
import { accessModels } from '@xartifact/x-llm-gateway-db'
import type { CanvasGraph } from '@xartifact/x-llm-gateway-shared'

interface RouteRuleDto {
  id: string
  accessModelId: string
  active: boolean
  version: number
}

function authPatch(c: CrudTestContext, path: string): Response | Promise<Response> {
  return authenticatedRequest(c.app, 'PATCH', path, c.token)
}

let ctx: CrudTestContext
let amId: string

async function createAccessModel(): Promise<string> {
  const db = getDatabase()
  const id = crypto.randomUUID()
  await db.insert(accessModels).values({
    id,
    name: `route-rules-api-test-${id.slice(0, 8)}`,
    displayName: null,
    description: null,
    enabled: true,
    capabilities: {},
    metadata: null,
  } satisfies typeof accessModels.$inferInsert)
  return id
}

const emptyGraph: CanvasGraph = { nodes: [], edges: [] }

describe('route-rules API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
    amId = await createAccessModel()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('POST creates a draft version', async () => {
    const res = await authPost(ctx, `/api/access-models/${amId}/route-rules`, {
      graph: emptyGraph,
      name: 'v1',
    })
    const { status, body } = await parseJson<RouteRuleDto>(res)
    expect(status).toBe(201)
    expect(body.success).toBe(true)
    expect(body.data.accessModelId).toBe(amId)
    expect(body.data.active).toBe(false)
  })

  it('POST with an invalid graph returns 400', async () => {
    const res = await authPost(ctx, `/api/access-models/${amId}/route-rules`, {
      graph: { nodes: [{ id: 'n1', type: 'condition', position: {}, data: 123 }], edges: [] },
    })
    expect(res.status).toBe(400)
  })

  it('GET lists all versions for the access model', async () => {
    const res = await authGet(ctx, `/api/access-models/${amId}/route-rules`)
    const { status, body } = await parseJson<RouteRuleDto[]>(res)
    expect(status).toBe(200)
    expect(Array.isArray(body.data)).toBe(true)
    expect(body.data.every((v) => v.accessModelId === amId)).toBe(true)
  })

  it('PATCH /:id/activate activates a version', async () => {
    const created = await authPost(ctx, `/api/access-models/${amId}/route-rules`, {
      graph: emptyGraph,
    })
    const { body: createdBody } = await parseJson<RouteRuleDto>(created)

    const res = await authPatch(
      ctx,
      `/api/access-models/${amId}/route-rules/${createdBody.data.id}/activate`,
    )
    const { status, body } = await parseJson<RouteRuleDto>(res)
    expect(status).toBe(200)
    expect(body.data.active).toBe(true)
  })

  it('DELETE rejects deleting the active version', async () => {
    const created = await authPost(ctx, `/api/access-models/${amId}/route-rules`, {
      graph: emptyGraph,
    })
    const { body: createdBody } = await parseJson<RouteRuleDto>(created)
    await authPatch(ctx, `/api/access-models/${amId}/route-rules/${createdBody.data.id}/activate`)

    const res = await authDelete(
      ctx,
      `/api/access-models/${amId}/route-rules/${createdBody.data.id}`,
    )
    expect(res.status).toBe(400)
  })

  it('DELETE removes a non-active draft', async () => {
    const created = await authPost(ctx, `/api/access-models/${amId}/route-rules`, {
      graph: emptyGraph,
    })
    const { body: createdBody } = await parseJson<RouteRuleDto>(created)

    const res = await authDelete(
      ctx,
      `/api/access-models/${amId}/route-rules/${createdBody.data.id}`,
    )
    expect(res.status).toBe(200)

    const getRes = await authGet(
      ctx,
      `/api/access-models/${amId}/route-rules/${createdBody.data.id}`,
    )
    expect(getRes.status).toBe(404)
  })
  it('POST /rebuild re-compiles the access model route and returns the new intentConfigs', async () => {
    // 回归用例：源码热更新（HMR 替换 module 但 engine 还在跑，cache 仍是旧的）
    // 后运维需要手动刷新；或者 schema 变化后强制重建。这个端点就是入口。
    const res = await authPost(ctx, `/api/access-models/${amId}/route-rules/rebuild`)
    expect(res.status).toBe(200)
    const { body } = await parseJson<{
      accessModelId: string
      before: number
      after: number
      intentConfigs: unknown[]
    }>(res)
    expect(body.success).toBe(true)
    expect(body.data.accessModelId).toBe(amId)
  })
})
