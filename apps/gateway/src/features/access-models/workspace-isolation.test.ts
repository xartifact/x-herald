import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { authenticatedRequest } from '../../test/hono-helper'
import {
  parseJson,
  setupCrudTest,
  teardownCrudTest,
  type CrudTestContext,
} from '../../test/crud-helper'

let ctx: CrudTestContext
let workspaceId: string

describe('access models workspace isolation', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
    const response = await authenticatedRequest(ctx.app, 'POST', '/api/workspaces', ctx.token, {
      body: { name: `Access model isolation ${crypto.randomUUID()}` },
    })
    const result = await parseJson<{ id: string }>(response)
    workspaceId = result.body.data.id
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('allows the same access-model name in separate workspaces and scopes list results', async () => {
    const name = `shared-model-${crypto.randomUUID()}`
    const defaultCreate = await authenticatedRequest(
      ctx.app,
      'POST',
      '/api/access-models',
      ctx.token,
      {
        body: { name },
      },
    )
    const workspaceCreate = await authenticatedRequest(
      ctx.app,
      'POST',
      '/api/access-models',
      ctx.token,
      { headers: { 'X-Workspace-Id': workspaceId }, body: { name } },
    )
    const defaultModel = await parseJson<{ id: string }>(defaultCreate)
    const workspaceModel = await parseJson<{ id: string }>(workspaceCreate)

    expect(defaultModel.status).toBe(201)
    expect(workspaceModel.status).toBe(201)
    expect(defaultModel.body.data.id).not.toBe(workspaceModel.body.data.id)

    const defaultList = await authenticatedRequest(ctx.app, 'GET', '/api/access-models', ctx.token)
    const workspaceList = await authenticatedRequest(
      ctx.app,
      'GET',
      '/api/access-models',
      ctx.token,
      {
        headers: { 'X-Workspace-Id': workspaceId },
      },
    )
    const defaultModels = await parseJson<Array<{ id: string; name: string }>>(defaultList)
    const workspaceModels = await parseJson<Array<{ id: string; name: string }>>(workspaceList)

    expect(defaultModels.body.data.some((model) => model.id === defaultModel.body.data.id)).toBe(
      true,
    )
    expect(defaultModels.body.data.some((model) => model.id === workspaceModel.body.data.id)).toBe(
      false,
    )
    expect(
      workspaceModels.body.data.some((model) => model.id === workspaceModel.body.data.id),
    ).toBe(true)
    expect(workspaceModels.body.data.some((model) => model.id === defaultModel.body.data.id)).toBe(
      false,
    )
  })

  it('does not allow reading, changing, or deleting an access model from another workspace', async () => {
    const createResponse = await authenticatedRequest(
      ctx.app,
      'POST',
      '/api/access-models',
      ctx.token,
      {
        headers: { 'X-Workspace-Id': workspaceId },
        body: { name: `private-model-${crypto.randomUUID()}` },
      },
    )
    const created = await parseJson<{ id: string }>(createResponse)
    const id = created.body.data.id

    const getResponse = await authenticatedRequest(
      ctx.app,
      'GET',
      `/api/access-models/${id}`,
      ctx.token,
    )
    const updateResponse = await authenticatedRequest(
      ctx.app,
      'PUT',
      `/api/access-models/${id}`,
      ctx.token,
      { body: { displayName: 'Cross-workspace edit' } },
    )
    const deleteResponse = await authenticatedRequest(
      ctx.app,
      'DELETE',
      `/api/access-models/${id}`,
      ctx.token,
    )

    expect(getResponse.status).toBe(404)
    expect(updateResponse.status).toBe(404)
    expect(deleteResponse.status).toBe(404)

    const stillExists = await authenticatedRequest(
      ctx.app,
      'GET',
      `/api/access-models/${id}`,
      ctx.token,
      { headers: { 'X-Workspace-Id': workspaceId } },
    )
    expect(stillExists.status).toBe(200)
  })
})
