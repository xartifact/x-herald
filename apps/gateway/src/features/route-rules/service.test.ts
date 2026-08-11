import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'
import { setupCrudTest, teardownCrudTest, type CrudTestContext } from '../../test/crud-helper'
import { getDatabase } from '../../db/client'
import { accessModels } from '@xartifact/x-llm-gateway-db'

import {
  activateVersion,
  clearRouteRuleCache,
  deleteVersion,
  getActiveRouteRule,
  getVersion,
  listVersions,
  loadAllActiveRouteRules,
  peekActiveRouteRule,
  saveDraft,
  subscribeToRouteRuleChanges,
} from './service'

let ctx: CrudTestContext
let amId: string

async function createAccessModel(): Promise<string> {
  const db = getDatabase()
  const id = crypto.randomUUID()
  await db.insert(accessModels).values({
    id,
    name: `route-rules-test-${id.slice(0, 8)}`,
    displayName: null,
    description: null,
    enabled: true,
    capabilities: {},
    metadata: null,
  } satisfies typeof accessModels.$inferInsert)
  return id
}

describe('route-rules service', () => {
  beforeAll(async () => {
    ctx = await setupCrudTest()
  })

  afterAll(async () => {
    await teardownCrudTest()
  })

  beforeEach(async () => {
    clearRouteRuleCache()
    amId = await createAccessModel()
  })

  it('saveDraft creates version 1, active=false by default', async () => {
    const draft = await saveDraft(amId, { nodes: [], edges: [] })
    expect(draft.version).toBe(1)
    expect(draft.active).toBe(false)
    expect(draft.accessModelId).toBe(amId)
  })

  it('saveDraft increments version on repeated calls for the same access model', async () => {
    const first = await saveDraft(amId, { nodes: [], edges: [] })
    const second = await saveDraft(amId, { nodes: [], edges: [] })
    expect(second.version).toBe(first.version + 1)
  })

  it('activateVersion flips active and updates the in-memory cache', async () => {
    const draft = await saveDraft(amId, { nodes: [], edges: [] }, { name: 'v1' })
    const activated = await activateVersion(draft.id)
    expect(activated.active).toBe(true)
    expect(peekActiveRouteRule(amId)?.id).toBe(draft.id)
  })

  it('activateVersion deactivates the previously active version for the same access model', async () => {
    const first = await saveDraft(amId, { nodes: [], edges: [] })
    await activateVersion(first.id)
    const second = await saveDraft(amId, { nodes: [], edges: [] })
    await activateVersion(second.id)

    const versions = await listVersions(amId)
    const firstAfter = versions.find((v) => v.id === first.id)
    const secondAfter = versions.find((v) => v.id === second.id)
    expect(firstAfter?.active).toBe(false)
    expect(secondAfter?.active).toBe(true)
  })

  it('activateVersion throws for a non-existent id', async () => {
    await expect(activateVersion(crypto.randomUUID())).rejects.toThrow()
  })

  it('deleteVersion removes a non-active draft', async () => {
    const draft = await saveDraft(amId, { nodes: [], edges: [] })
    await deleteVersion(draft.id)
    expect(await getVersion(draft.id)).toBeNull()
  })

  it('deleteVersion rejects deleting the currently active version', async () => {
    const draft = await saveDraft(amId, { nodes: [], edges: [] })
    await activateVersion(draft.id)
    await expect(deleteVersion(draft.id)).rejects.toThrow()
  })

  it('getActiveRouteRule lazily loads the cache when not yet loaded', async () => {
    const draft = await saveDraft(amId, { nodes: [], edges: [] })
    await activateVersion(draft.id)
    clearRouteRuleCache()

    const active = await getActiveRouteRule(amId)
    expect(active?.id).toBe(draft.id)
  })

  it('loadAllActiveRouteRules only returns active rows', async () => {
    const draft = await saveDraft(amId, { nodes: [], edges: [] })
    await activateVersion(draft.id)
    await saveDraft(amId, { nodes: [], edges: [] }) // draft, stays inactive

    const rows = await loadAllActiveRouteRules()
    const forThisAm = rows.filter((r) => r.accessModelId === amId)
    expect(forThisAm).toHaveLength(1)
    expect(forThisAm[0].active).toBe(true)
  })

  it('subscribeToRouteRuleChanges fires with the access model id on activate', async () => {
    let notified: string | undefined
    const unsubscribe = subscribeToRouteRuleChanges((accessModelId) => {
      notified = accessModelId
    })
    const draft = await saveDraft(amId, { nodes: [], edges: [] })
    await activateVersion(draft.id)
    unsubscribe()

    expect(notified).toBe(amId)
  })
})
