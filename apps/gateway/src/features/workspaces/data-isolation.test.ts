import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { costRecords, requestLogs } from '@xartifact/x-herald-db'
import { getDatabase } from '../../db/client'
import { authenticatedRequest } from '../../test/hono-helper'
import { setupCrudTest, teardownCrudTest, type CrudTestContext } from '../../test/crud-helper'

let ctx: CrudTestContext
let workspaceId: string
let defaultLogId: string
let workspaceLogId: string
let defaultModel: string
let workspaceModel: string

describe('workspace observability isolation', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
    const workspaceResponse = await authenticatedRequest(
      ctx.app,
      'POST',
      '/api/workspaces',
      ctx.token,
      {
        body: { name: `Observability isolation ${crypto.randomUUID()}` },
      },
    )
    const workspaceBody = (await workspaceResponse.json()) as { data: { id: string } }
    workspaceId = workspaceBody.data.id

    defaultModel = `default-only-${crypto.randomUUID()}`
    workspaceModel = `workspace-only-${crypto.randomUUID()}`
    const defaultLog = await getDatabase()
      .insert(requestLogs)
      .values({
        requestGroupId: crypto.randomUUID(),
        modelName: defaultModel,
        status: 'success',
        responseTimeMs: 10,
        totalTokens: 5,
      })
      .returning({ id: requestLogs.id })
    defaultLogId = defaultLog[0].id
    const workspaceLog = await getDatabase()
      .insert(requestLogs)
      .values({
        workspaceId,
        requestGroupId: crypto.randomUUID(),
        modelName: workspaceModel,
        status: 'success',
        responseTimeMs: 20,
        totalTokens: 7,
        metadata: {
          routing: {
            routeChain: {
              requestedModel: workspaceModel,
              chain: [{ index: 0, kind: 'single', actionType: 'route_to_group', candidates: [] }],
            },
          },
        },
      })
      .returning({ id: requestLogs.id })
    workspaceLogId = workspaceLog[0].id

    await getDatabase()
      .insert(costRecords)
      .values([
        { modelName: defaultModel, inputTokens: 1, outputTokens: 1, totalCost: 1 },
        { workspaceId, modelName: workspaceModel, inputTokens: 2, outputTokens: 3, totalCost: 7 },
      ])
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('lists logs only from the selected workspace and hides foreign log details', async () => {
    const defaultResponse = await authenticatedRequest(ctx.app, 'GET', '/api/logs', ctx.token)
    const workspaceResponse = await authenticatedRequest(ctx.app, 'GET', '/api/logs', ctx.token, {
      headers: { 'X-Workspace-Id': workspaceId },
    })
    const defaultBody = (await defaultResponse.json()) as { data: Array<{ id: string }> }
    const workspaceBody = (await workspaceResponse.json()) as { data: Array<{ id: string }> }

    expect(defaultBody.data.some((log) => log.id === defaultLogId)).toBe(true)
    expect(defaultBody.data.some((log) => log.id === workspaceLogId)).toBe(false)
    expect(workspaceBody.data.some((log) => log.id === workspaceLogId)).toBe(true)
    expect(workspaceBody.data.some((log) => log.id === defaultLogId)).toBe(false)

    const foreignDetail = await authenticatedRequest(
      ctx.app,
      'GET',
      `/api/logs/${workspaceLogId}`,
      ctx.token,
    )
    expect(foreignDetail.status).toBe(404)
  })

  it('aggregates costs only from the selected workspace', async () => {
    const defaultResponse = await authenticatedRequest(
      ctx.app,
      'GET',
      '/api/costs/summary',
      ctx.token,
    )
    const workspaceResponse = await authenticatedRequest(
      ctx.app,
      'GET',
      '/api/costs/summary',
      ctx.token,
      { headers: { 'X-Workspace-Id': workspaceId } },
    )
    const defaultBody = (await defaultResponse.json()) as { data: { totalCost: number } }
    const workspaceBody = (await workspaceResponse.json()) as { data: { totalCost: number } }

    expect(defaultBody.data.totalCost).toBe(1)
    expect(workspaceBody.data.totalCost).toBe(7)
  })

  it('scopes routing-trace lists and details to the selected workspace', async () => {
    const defaultResponse = await authenticatedRequest(
      ctx.app,
      'GET',
      '/api/routing-traces',
      ctx.token,
    )
    const workspaceResponse = await authenticatedRequest(
      ctx.app,
      'GET',
      '/api/routing-traces',
      ctx.token,
      { headers: { 'X-Workspace-Id': workspaceId } },
    )
    const defaultBody = (await defaultResponse.json()) as { items: Array<{ logId: string }> }
    const workspaceBody = (await workspaceResponse.json()) as { items: Array<{ logId: string }> }

    expect(defaultBody.items.some((trace) => trace.logId === workspaceLogId)).toBe(false)
    expect(workspaceBody.items.some((trace) => trace.logId === workspaceLogId)).toBe(true)

    const foreignDetail = await authenticatedRequest(
      ctx.app,
      'GET',
      `/api/routing-traces/${workspaceLogId}`,
      ctx.token,
    )
    expect(foreignDetail.status).toBe(404)
  })
})
