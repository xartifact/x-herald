import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { DEFAULT_WORKSPACE_ID } from './context'
import {
  parseJson,
  setupCrudTest,
  teardownCrudTest,
  type CrudTestContext,
} from '../../test/crud-helper'
import { authenticatedRequest } from '../../test/hono-helper'

let ctx: CrudTestContext

describe('workspaces API', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('lists the seeded default workspace', async () => {
    const res = await authenticatedRequest(ctx.app, 'GET', '/api/workspaces', ctx.token)
    const { status, body } = await parseJson<Array<{ id: string; isDefault: boolean }>>(res)

    expect(status).toBe(200)
    expect(
      body.data.some((workspace) => workspace.id === DEFAULT_WORKSPACE_ID && workspace.isDefault),
    ).toBe(true)
  })

  it('creates, renames, and deletes an empty workspace', async () => {
    const createdResponse = await authenticatedRequest(
      ctx.app,
      'POST',
      '/api/workspaces',
      ctx.token,
      {
        body: { name: `Workspace ${crypto.randomUUID()}` },
      },
    )
    const created = await parseJson<{ id: string; name: string }>(createdResponse)
    expect(created.status).toBe(201)

    const renamedResponse = await authenticatedRequest(
      ctx.app,
      'PUT',
      `/api/workspaces/${created.body.data.id}`,
      ctx.token,
      { body: { name: 'Renamed workspace' } },
    )
    const renamed = await parseJson<{ id: string; name: string }>(renamedResponse)
    expect(renamed.status).toBe(200)
    expect(renamed.body.data.name).toBe('Renamed workspace')

    const deletedResponse = await authenticatedRequest(
      ctx.app,
      'DELETE',
      `/api/workspaces/${created.body.data.id}`,
      ctx.token,
    )
    expect(deletedResponse.status).toBe(200)
  })

  it('rejects deleting the default workspace', async () => {
    const res = await authenticatedRequest(
      ctx.app,
      'DELETE',
      `/api/workspaces/${DEFAULT_WORKSPACE_ID}`,
      ctx.token,
    )
    expect(res.status).toBe(400)
  })

  it('rejects deleting a workspace that still contains scoped resources', async () => {
    const workspaceResponse = await authenticatedRequest(
      ctx.app,
      'POST',
      '/api/workspaces',
      ctx.token,
      {
        body: { name: `Non-empty workspace ${crypto.randomUUID()}` },
      },
    )
    const workspace = await parseJson<{ id: string }>(workspaceResponse)
    const accessModelResponse = await authenticatedRequest(
      ctx.app,
      'POST',
      '/api/access-models',
      ctx.token,
      {
        headers: { 'X-Workspace-Id': workspace.body.data.id },
        body: { name: `workspace-model-${crypto.randomUUID()}` },
      },
    )
    expect(accessModelResponse.status).toBe(201)

    const deleteResponse = await authenticatedRequest(
      ctx.app,
      'DELETE',
      `/api/workspaces/${workspace.body.data.id}`,
      ctx.token,
    )
    expect(deleteResponse.status).toBe(409)
  })

  it('rejects a missing or malformed workspace scope on workspace-scoped APIs', async () => {
    const res = await authenticatedRequest(ctx.app, 'GET', '/api/access-models', ctx.token, {
      headers: { 'X-Workspace-Id': 'not-a-uuid' },
    })
    const { status, body } = await parseJson(res)

    expect(status).toBe(404)
    expect(body.code).toBe('WORKSPACE_NOT_FOUND')
  })
})
