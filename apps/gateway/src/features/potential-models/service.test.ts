import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test'

import { getDatabase } from '../../db/client'
import { createTestEngine, type TestEngineHandle } from '../../test/setup'
import { createTestVirtualKey } from '../../test/factories'

import {
  recordPotentialHit,
  lookupActivePotentialTarget,
  listPotentialModels,
  getPotentialModel,
  updatePotentialModel,
  deletePotentialModel,
  convertToAccessModel,
  runCleanup,
  installCleanupJob,
  stopCleanupJob,
} from './service'
import { accessModels, potentialModels, virtualKeys } from '@xartifact/x-llm-gateway-db'
import { sql } from 'drizzle-orm'
import type { AccessModel } from '@xartifact/x-llm-gateway-db'

let engine: TestEngineHandle

beforeAll(async () => {
  engine = await createTestEngine()
})

afterAll(async () => {
  await engine?.cleanup?.()
})

beforeEach(async () => {
  await getDatabase().delete(potentialModels)
  await getDatabase().delete(accessModels)
})

function makeAccessModel(name: string): AccessModel {
  return {
    id: crypto.randomUUID(),
    name,
    displayName: name,
    description: null,
    enabled: true,
    capabilities: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
}

async function insertAccessModel(name = 'gpt-4o') {
  const am = makeAccessModel(name)
  const [row] = await getDatabase().insert(accessModels).values(am).returning()
  return row
}

async function insertVirtualKey(name = 'test-key') {
  const vk = createTestVirtualKey({ name })
  const [row] = await getDatabase().insert(virtualKeys).values(vk).returning()
  return row
}

describe('recordPotentialHit', () => {
  it('does not persist below the hit threshold (3)', async () => {
    await recordPotentialHit('gpt-rare-model-1')
    await recordPotentialHit('gpt-rare-model-1')
    const rows = await getDatabase()
      .select()
      .from(potentialModels)
      .where(sql`${potentialModels.modelName} = 'gpt-rare-model-1'`)
    expect(rows).toHaveLength(0)
  })

  it('persists on the 3rd hit and increments on subsequent hits', async () => {
    const vk = await insertVirtualKey('vk-1')
    await recordPotentialHit('gpt-threshold-model', vk.id)
    await recordPotentialHit('gpt-threshold-model', vk.id)
    await recordPotentialHit('gpt-threshold-model', vk.id)

    let rows = await getDatabase()
      .select()
      .from(potentialModels)
      .where(sql`${potentialModels.modelName} = 'gpt-threshold-model'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].requestCount).toBe(1)
    expect(rows[0].sampleVirtualKeyIds).toContain(vk.id)

    await recordPotentialHit('gpt-threshold-model', vk.id)
    await recordPotentialHit('gpt-threshold-model', vk.id)
    rows = await getDatabase()
      .select()
      .from(potentialModels)
      .where(sql`${potentialModels.modelName} = 'gpt-threshold-model'`)
    expect(rows).toHaveLength(1)
    expect(rows[0].requestCount).toBeGreaterThanOrEqual(3)
  })

  it('ignores empty / oversized model names', async () => {
    await recordPotentialHit('')
    await recordPotentialHit('x'.repeat(300))
    const rows = await listPotentialModels()
    expect(rows).toHaveLength(0)
  })
})

describe('lookupActivePotentialTarget', () => {
  it('returns null when no record exists', async () => {
    const result = await lookupActivePotentialTarget('no-such-model')
    expect(result).toBeNull()
  })

  it('returns target when action=route_to_access_model and target is enabled', async () => {
    const am = await insertAccessModel('gpt-4o-real')
    await getDatabase().insert(potentialModels).values({
      modelName: 'gpt-4o-mock',
      requestCount: 5,
      action: 'route_to_access_model',
      targetAccessModelId: am.id,
      enabled: true,
    })

    const result = await lookupActivePotentialTarget('gpt-4o-mock')
    expect(result).not.toBeNull()
    expect(result?.targetAccessModelId).toBe(am.id)
    expect(result?.targetAccessModelName).toBe('gpt-4o-real')
  })

  it('returns null when action=observe (only route_to is active)', async () => {
    await getDatabase()
      .insert(potentialModels)
      .values({ modelName: 'gpt-4o-obs', requestCount: 5, action: 'observe', enabled: true })
    const result = await lookupActivePotentialTarget('gpt-4o-obs')
    expect(result).toBeNull()
  })

  it('returns null when enabled=false', async () => {
    const am = await insertAccessModel('gpt-4o-real')
    await getDatabase().insert(potentialModels).values({
      modelName: 'gpt-4o-disabled',
      requestCount: 5,
      action: 'route_to_access_model',
      targetAccessModelId: am.id,
      enabled: false,
    })
    const result = await lookupActivePotentialTarget('gpt-4o-disabled')
    expect(result).toBeNull()
  })

  it('returns null when target access model is disabled', async () => {
    const am = await insertAccessModel('gpt-4o-target')
    await getDatabase()
      .update(accessModels)
      .set({ enabled: false })
      .where(sql`${accessModels.id} = ${am.id}`)

    await getDatabase().insert(potentialModels).values({
      modelName: 'gpt-4o-stale',
      requestCount: 5,
      action: 'route_to_access_model',
      targetAccessModelId: am.id,
      enabled: true,
    })
    const result = await lookupActivePotentialTarget('gpt-4o-stale')
    expect(result).toBeNull()
  })
})

describe('listPotentialModels / getPotentialModel', () => {
  it('orders by request_count desc then last_seen_at desc', async () => {
    await getDatabase()
      .insert(potentialModels)
      .values([
        { modelName: 'a', requestCount: 1 },
        { modelName: 'b', requestCount: 10 },
        { modelName: 'c', requestCount: 5 },
      ])
    const rows = await listPotentialModels()
    expect(rows.map((r) => r.modelName)).toEqual(['b', 'c', 'a'])
  })

  it('filters by minCount', async () => {
    await getDatabase()
      .insert(potentialModels)
      .values([
        { modelName: 'a', requestCount: 1 },
        { modelName: 'b', requestCount: 5 },
      ])
    const rows = await listPotentialModels({ minCount: 3 })
    expect(rows).toHaveLength(1)
    expect(rows[0].modelName).toBe('b')
  })
})

describe('updatePotentialModel', () => {
  it('clears targetAccessModelId when action is set to observe', async () => {
    const am = await insertAccessModel('target')
    const [pm] = await getDatabase()
      .insert(potentialModels)
      .values({
        modelName: 'm',
        requestCount: 5,
        action: 'route_to_access_model',
        targetAccessModelId: am.id,
        enabled: true,
      })
      .returning()

    const updated = await updatePotentialModel(pm.id, { action: 'observe' })
    expect(updated?.action).toBe('observe')
    expect(updated?.targetAccessModelId).toBeNull()
  })

  it('throws when action=route_to_access_model without target', async () => {
    const [pm] = await getDatabase()
      .insert(potentialModels)
      .values({ modelName: 'm2', requestCount: 5, action: 'observe' })
      .returning()
    await expect(updatePotentialModel(pm.id, { action: 'route_to_access_model' })).rejects.toThrow(
      /targetAccessModelId is required/,
    )
  })
})

describe('convertToAccessModel', () => {
  it('creates a new access_model and deletes the potential row by default', async () => {
    const [pm] = await getDatabase()
      .insert(potentialModels)
      .values({ modelName: 'gpt-4o-new', requestCount: 7, action: 'observe', enabled: true })
      .returning()

    const result = await convertToAccessModel(pm.id, { enabled: true })
    expect(result.accessModelId).toBeTruthy()
    expect(result.potentialDeleted).toBe(true)

    const amRows = await getDatabase()
      .select()
      .from(accessModels)
      .where(sql`${accessModels.name} = 'gpt-4o-new'`)
    expect(amRows).toHaveLength(1)

    const pmRows = await getDatabase()
      .select()
      .from(potentialModels)
      .where(sql`${potentialModels.id} = ${pm.id}`)
    expect(pmRows).toHaveLength(0)
  })

  it('keeps the potential row (re-pointed to self) when deleteAfterConvert=false', async () => {
    const [pm] = await getDatabase()
      .insert(potentialModels)
      .values({ modelName: 'gpt-4o-keep', requestCount: 7, action: 'observe', enabled: true })
      .returning()

    const result = await convertToAccessModel(pm.id, {
      enabled: true,
      deleteAfterConvert: false,
    })
    expect(result.potentialDeleted).toBe(false)

    const pmRows = await getDatabase()
      .select()
      .from(potentialModels)
      .where(sql`${potentialModels.id} = ${pm.id}`)
    expect(pmRows).toHaveLength(1)
    expect(pmRows[0].action).toBe('route_to_access_model')
    expect(pmRows[0].targetAccessModelId).toBe(result.accessModelId)
  })

  it('throws when potential model does not exist', async () => {
    await expect(convertToAccessModel(crypto.randomUUID(), { enabled: true })).rejects.toThrow(
      /not found/,
    )
  })
})

describe('runCleanup', () => {
  it('removes only observe+enabled rows older than cutoff', async () => {
    const now = new Date('2026-07-30T00:00:00Z')
    const old = new Date('2026-06-01T00:00:00Z') // ~60 days before
    const fresh = new Date('2026-07-15T00:00:00Z') // ~15 days before

    const [routePm] = await getDatabase()
      .insert(potentialModels)
      .values({
        modelName: 'route-old',
        requestCount: 1,
        action: 'route_to_access_model',
        enabled: true,
        firstSeenAt: old,
        lastSeenAt: old,
      })
      .returning()

    await getDatabase().insert(potentialModels).values({
      modelName: 'observe-old',
      requestCount: 1,
      action: 'observe',
      enabled: true,
      firstSeenAt: old,
      lastSeenAt: old,
    })

    await getDatabase().insert(potentialModels).values({
      modelName: 'observe-fresh',
      requestCount: 1,
      action: 'observe',
      enabled: true,
      firstSeenAt: fresh,
      lastSeenAt: fresh,
    })

    const [disabledPm] = await getDatabase()
      .insert(potentialModels)
      .values({
        modelName: 'observe-disabled-old',
        requestCount: 1,
        action: 'observe',
        enabled: false,
        firstSeenAt: old,
        lastSeenAt: old,
      })
      .returning()

    const result = await runCleanup({ olderThanDays: 30, now })
    expect(result.deleted).toBe(1)
    expect(result.cutoff.toISOString()).toBe('2026-06-30T00:00:00.000Z')

    const remaining = await listPotentialModels()
    const names = remaining.map((r) => r.modelName).toSorted()
    expect(names).toEqual(['observe-fresh', 'observe-disabled-old', 'route-old'].toSorted())

    // route-old: action=route_to_access_model - should NOT be deleted
    const routeRow = remaining.find((r) => r.id === routePm.id)
    expect(routeRow).toBeTruthy()
    // disabled-old: enabled=false - should NOT be deleted
    const disabledRow = remaining.find((r) => r.id === disabledPm.id)
    expect(disabledRow).toBeTruthy()
  })
})

describe('cleanup job lifecycle', () => {
  it('installCleanupJob is idempotent and stopCleanupJob resets the flag', () => {
    installCleanupJob(1_000_000)
    installCleanupJob(1_000_000) // second call should be a no-op
    stopCleanupJob()
    stopCleanupJob() // second call should be safe
  })
})
