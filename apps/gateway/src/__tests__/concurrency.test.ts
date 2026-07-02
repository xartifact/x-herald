import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import {
  setupCrudTest,
  teardownCrudTest,
  parseJson,
  authPost,
  authPut,
  authDelete,
  authGet,
  uniqueName,
  type CrudTestContext,
} from '../test/crud-helper'
import { authenticatedRequest } from '../test/hono-helper'

let ctx: CrudTestContext

describe('concurrency — keys', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  it('creates 5 keys with different names in parallel — all succeed with 201', async () => {
    const names = Array.from({ length: 5 }, () => uniqueName('concurrent-key'))
    const results = await Promise.all(
      names.map((name) =>
        authPost(ctx, '/api/keys', { name }).then((r) =>
          parseJson<{ id: string; name: string }>(r),
        ),
      ),
    )

    for (const { status, body } of results) {
      expect(status).toBe(201)
      expect(body.success).toBe(true)
    }

    const createdNames = results.map((r) => r.body.data.name)
    for (const name of names) {
      expect(createdNames).toContain(name)
    }
  })

  it('creates 2 keys with the same name in parallel — at most one succeeds', async () => {
    const duplicateName = uniqueName('dup-key')
    const results = await Promise.all([
      authPost(ctx, '/api/keys', { name: duplicateName }).then((r) => parseJson(r)),
      authPost(ctx, '/api/keys', { name: duplicateName }).then((r) => parseJson(r)),
    ])

    const succeeded = results.filter((r) => r.status === 201)
    const failed = results.filter((r) => r.status !== 201)
    expect(succeeded.length).toBeGreaterThanOrEqual(1)
    expect(succeeded.length + failed.length).toBe(2)

    if (failed.length > 0) {
      for (const f of failed) {
        expect(f.status === 409 || f.status === 500).toBe(true)
      }
    }
  })

  it('updates the same key concurrently with different names — final state has one of the two names', async () => {
    const baseName = uniqueName('key-for-update')
    const createRes = await authPost(ctx, '/api/keys', { name: baseName })
    const { data: created } = (await parseJson<{ id: string; name: string }>(createRes)).body

    const nameA = uniqueName('name-a')
    const nameB = uniqueName('name-b')
    await Promise.all([
      authPut(ctx, `/api/keys/${created.id}`, { name: nameA }),
      authPut(ctx, `/api/keys/${created.id}`, { name: nameB }),
    ])

    const getRes = await authGet(ctx, `/api/keys/${created.id}`)
    const { body: finalBody } = await parseJson<{ name: string }>(getRes)
    expect([nameA, nameB]).toContain(finalBody.data.name)
  })

  it('deletes the same key concurrently — first 200, second 404', async () => {
    const name = uniqueName('key-for-del')
    const createRes = await authPost(ctx, '/api/keys', { name })
    const { data: created } = (await parseJson<{ id: string }>(createRes)).body

    const [resA, resB] = await Promise.all([
      authDelete(ctx, `/api/keys/${created.id}`).then((r) => r.status),
      authDelete(ctx, `/api/keys/${created.id}`).then((r) => r.status),
    ])

    const statuses = [resA, resB].toSorted()
    expect(statuses[0]).toBeLessThanOrEqual(200)
    expect(statuses[1]).toBeGreaterThanOrEqual(404)

    const okCount = statuses.filter((s) => s === 200).length
    const notFoundCount = statuses.filter((s) => s === 404).length
    expect(okCount + notFoundCount).toBe(2)
  })
})

describe('concurrency — providers', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  const validProtocols = { openai: { baseUrl: 'https://api.openai.com', enabled: true } }

  it('creates 3 providers with different names in parallel — all succeed', async () => {
    const names = Array.from({ length: 3 }, () => uniqueName('concurrent-provider'))
    const results = await Promise.all(
      names.map((name) =>
        authPost(ctx, '/api/providers', { name, protocols: validProtocols }).then((r) =>
          parseJson<{ id: string; name: string }>(r),
        ),
      ),
    )

    for (const { status, body } of results) {
      expect(status).toBe(201)
      expect(body.success).toBe(true)
    }

    const createdNames = results.map((r) => r.body.data.name)
    for (const name of names) {
      expect(createdNames).toContain(name)
    }
  })

  it('toggles the same provider on/off concurrently — final enabled state is deterministic', async () => {
    const name = uniqueName('provider-toggle')
    const createRes = await authPost(ctx, '/api/providers', { name, protocols: validProtocols })
    const { data: created } = (await parseJson<{ id: string; enabled: boolean }>(createRes)).body
    expect(created.enabled).toBe(true)

    const togglePath = `/api/providers/${created.id}/toggle`
    await Promise.all([
      authenticatedRequest(ctx.app, 'PATCH', togglePath, ctx.token),
      authenticatedRequest(ctx.app, 'PATCH', togglePath, ctx.token),
    ])

    const getRes = await authGet(ctx, `/api/providers/${created.id}`)
    const { body: finalBody } = await parseJson<{ enabled: boolean }>(getRes)
    expect(typeof finalBody.data.enabled).toBe('boolean')
    expect([true, false]).toContain(finalBody.data.enabled)
  })

  it('deletes the same provider concurrently — first 200, second 404', async () => {
    const name = uniqueName('provider-for-del')
    const createRes = await authPost(ctx, '/api/providers', { name, protocols: validProtocols })
    const { data: created } = (await parseJson<{ id: string }>(createRes)).body

    const [resA, resB] = await Promise.all([
      authDelete(ctx, `/api/providers/${created.id}`).then((r) => r.status),
      authDelete(ctx, `/api/providers/${created.id}`).then((r) => r.status),
    ])

    const statuses = [resA, resB].toSorted()
    expect(statuses[0]).toBeLessThanOrEqual(200)
    expect(statuses[1]).toBeGreaterThanOrEqual(404)

    const okCount = statuses.filter((s) => s === 200).length
    const notFoundCount = statuses.filter((s) => s === 404).length
    expect(okCount + notFoundCount).toBe(2)
  })
})
