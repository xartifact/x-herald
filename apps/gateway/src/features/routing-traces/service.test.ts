/**
 * Routing Trace Query Service - cursor pagination tests
 *
 * Regression test for the "下一页 没有数据" bug:
 *   listRoutingTraces previously used raw `sql` template with `${new Date(...)}`,
 *   which the postgres.js driver rejects with "must be string or Buffer or
 *   ArrayBuffer, received an instance of Date". Page 2 failed with 500 and
 *   the UI fell back to the empty state. PGlite silently coerces Date, so a
 *   happy-path DB test would not catch the regression — we also exercise the
 *   cursor predicate via Drizzle's toSQL() to lock the bound-parameter types.
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'
import { and, eq } from 'drizzle-orm'

import {
  MIGRATIONS_FOLDER,
  requestLogs,
  runPgliteMigrations,
  lt,
  or,
  type SQL,
} from '@xartifact/x-llm-gateway-db'

import type { Database } from '../../db/client'
import { buildCursorPredicate, getRoutingTraceDetail, listRoutingTraces } from './service'

type PGliteClient = {
  exec: (sql: string) => Promise<unknown>
  close: () => void
}

let pgliteClient: PGliteClient | undefined
let db: Database | undefined
let g: { __xllm_dbClient?: Database; __xllm_postgresClient?: unknown }

beforeAll(async () => {
  process.env.LOG_LEVEL = 'error'
  const { PGlite } = await import('@electric-sql/pglite')
  pgliteClient = new PGlite()
  await pgliteClient.exec("SET timezone = 'UTC'")

  db = drizzlePglite(pgliteClient, { schema: { requestLogs } }) as unknown as Database

  await runPgliteMigrations(pgliteClient, MIGRATIONS_FOLDER, {
    trace() {},
    info() {},
    warn() {},
    error() {},
  })

  g = globalThis as unknown as typeof g
  g.__xllm_dbClient = db
  g.__xllm_postgresClient = undefined
})

afterAll(async () => {
  g.__xllm_dbClient = undefined
  g.__xllm_postgresClient = undefined
  pgliteClient?.close()
})

async function seedTraces(count: number): Promise<void> {
  if (!db) throw new Error('db not initialized')

  const base = Date.now()
  for (let i = 0; i < count; i++) {
    await db.insert(requestLogs).values({
      id: crypto.randomUUID(),
      requestGroupId: crypto.randomUUID(),
      candidateIndex: 0,
      modelName: `model-${i}`,
      originalModelName: 'gpt-4',
      status: 'success',
      statusCode: 200,
      responseTimeMs: 100 + i,
      metadata: {
        routing: {
          routeChain: {
            requestedModel: 'gpt-4',
            chain: [{ index: 0, kind: 'single', actionType: 'direct', candidates: [] }],
          },
          actualModelName: `model-${i}`,
        },
      },
      createdAt: new Date(base + i),
    })
  }
}

describe('listRoutingTraces - cursor pagination', () => {
  it('returns the first page and a non-null nextCursor when more rows exist', async () => {
    await seedTraces(15)

    const page = await listRoutingTraces({ pageSize: 5 })

    expect(page.items).toHaveLength(5)
    expect(page.hasMore).toBe(true)
    expect(page.nextCursor).not.toBeNull()
  })

  it('returns the next page when a cursor is supplied', async () => {
    const first = await listRoutingTraces({ pageSize: 5 })
    expect(first.hasMore).toBe(true)

    const second = await listRoutingTraces({
      pageSize: 5,
      cursor: first.nextCursor ?? undefined,
    })

    expect(second.items.length).toBeGreaterThan(0)
    expect(second.items.length).toBeLessThanOrEqual(5)

    const firstIds = new Set(first.items.map((i) => i.requestGroupId))
    for (const item of second.items) {
      expect(firstIds.has(item.requestGroupId)).toBe(false)
    }
  })

  it('reports hasMore=false on the final page', async () => {
    const first = await listRoutingTraces({ pageSize: 5 })
    let cursor = first.nextCursor ?? undefined
    let last = first
    let safety = 10
    while (last.hasMore && safety-- > 0) {
      last = await listRoutingTraces({ pageSize: 5, cursor })
      cursor = last.nextCursor ?? undefined
    }
    expect(last.hasMore).toBe(false)
    expect(last.nextCursor).toBeNull()
    expect(last.items.length).toBeGreaterThan(0)
  })

  it('ignores malformed cursor and falls back to the first page', async () => {
    const page = await listRoutingTraces({ pageSize: 5, cursor: 'not-base64-json' })
    expect(page.items.length).toBeGreaterThan(0)
  })

  it('combines cursor with filters (outcome filter)', async () => {
    const first = await listRoutingTraces({ pageSize: 3, outcome: 'success' })
    expect(first.items.length).toBeGreaterThan(0)
    if (first.hasMore) {
      const second = await listRoutingTraces({
        pageSize: 3,
        outcome: 'success',
        cursor: first.nextCursor ?? undefined,
      })
      expect(second.items.length).toBeGreaterThan(0)
    }
  })

  /**
   * Lock the production regression: the cursor predicate must compile to
   * parameters that are safe for the postgres.js driver (string/Buffer),
   * never a raw Date instance. The buggy `sql` template embedded `new Date(...)`
   * directly, which PGlite happily coerced but postgres.js rejected.
   */
  it('emits no Date parameters in the cursor predicate (regression)', () => {
    const cursor = Buffer.from(
      JSON.stringify({
        createdAt: '2026-08-01T12:00:00.000Z',
        id: '01HKXXXXXXXXXXXXXXXXXXXXXXXX',
      }),
    ).toString('base64')

    const predicate = buildCursorPredicate(cursor)
    expect(predicate).not.toBeNull()

    const fakeQuery = db!
      .select({ id: requestLogs.id })
      .from(requestLogs)
      .where(and(predicate as SQL))
      .limit(1)

    const { sql: boundSql, params } = fakeQuery.toSQL()

    expect(boundSql).toContain('"request_logs"."created_at"')
    expect(boundSql).toContain('"request_logs"."id"')

    for (const p of params) {
      expect(p).not.toBeInstanceOf(Date)
    }

    // The cursor's createdAt ISO string must be bound as-is.
    expect(params).toContain('2026-08-01T12:00:00.000Z')
    expect(params).toContain('01HKXXXXXXXXXXXXXXXXXXXXXXXX')
  })
})

/**
 * Regression coverage: routing-traces used to only ever store a routeChain
 * for successful requests (candidates.length > 0), so reject / no-candidate
 * failures never showed up in 路由追踪 at all — request_logs.status was
 * 'failure' but metadata.routing.routeChain was never set. access-model-router.ts
 * now attaches a routeChain (with outcome: 'rejected' | 'all_failed') to the
 * thrown error even when zero candidates were produced.
 */
describe('listRoutingTraces / getRoutingTraceDetail - failure-path coverage', () => {
  async function seedFailureLog(opts: {
    outcome: 'rejected' | 'all_failed'
    errorMessage: string
    failedStep?: { actionType: string; intentName?: string; intentSource?: string }
  }): Promise<{ id: string }> {
    if (!db) throw new Error('db not initialized')
    const id = crypto.randomUUID()
    await db.insert(requestLogs).values({
      id,
      requestGroupId: crypto.randomUUID(),
      candidateIndex: 0,
      modelName: 'gpt-4',
      originalModelName: 'gpt-4',
      status: 'failure',
      statusCode: opts.outcome === 'rejected' ? 403 : 503,
      responseTimeMs: 5,
      errorMessage: opts.errorMessage,
      errorType: opts.outcome === 'rejected' ? 'request_rejected' : 'service_unavailable',
      metadata: {
        routing: {
          routeChain: {
            requestedModel: 'gpt-4',
            matchedRule: { id: 'rule-1', name: 'Test Rule', priority: 0 },
            chain: opts.failedStep
              ? [{ index: 0, kind: 'single', ...opts.failedStep, candidates: [] }]
              : [],
            outcome: opts.outcome,
          },
        },
      },
      createdAt: new Date(),
    })
    return { id }
  }

  it('surfaces a rejected request in the list with outcome=rejected', async () => {
    const { id } = await seedFailureLog({
      outcome: 'rejected',
      errorMessage: "Request rejected by route rule 'Test Rule'",
      failedStep: { actionType: 'reject' },
    })

    const page = await listRoutingTraces({ pageSize: 50 })
    const found = page.items.find((i) => i.logId === id)
    expect(found).toBeDefined()
    expect(found?.outcome).toBe('rejected')
  })

  it('surfaces a no-candidates failure in the list with outcome=all_failed', async () => {
    const { id } = await seedFailureLog({
      outcome: 'all_failed',
      errorMessage: "Intent routing: group 'g-1' returned no candidates",
      failedStep: { actionType: 'intent', intentName: 'coding', intentSource: 'classifier' },
    })

    const page = await listRoutingTraces({ pageSize: 50 })
    const found = page.items.find((i) => i.logId === id)
    expect(found).toBeDefined()
    expect(found?.outcome).toBe('all_failed')
  })

  it('filters by outcome=rejected without matching all_failed rows', async () => {
    const rejected = await seedFailureLog({ outcome: 'rejected', errorMessage: 'rejected' })
    const failed = await seedFailureLog({ outcome: 'all_failed', errorMessage: 'no candidates' })

    const page = await listRoutingTraces({ pageSize: 50, outcome: 'rejected' })
    const ids = page.items.map((i) => i.logId)
    expect(ids).toContain(rejected.id)
    expect(ids).not.toContain(failed.id)
  })

  it('getRoutingTraceDetail exposes errorMessage and the intent decision behind a no-candidates failure', async () => {
    const { id } = await seedFailureLog({
      outcome: 'all_failed',
      errorMessage: "Intent routing: group 'g-1' returned no candidates",
      failedStep: { actionType: 'intent', intentName: 'coding', intentSource: 'classifier' },
    })

    const detail = await getRoutingTraceDetail(id)
    expect(detail?.outcome).toBe('all_failed')
    expect(detail?.errorMessage).toBe("Intent routing: group 'g-1' returned no candidates")
    expect(detail?.chain[0]?.intentName).toBe('coding')
    expect(detail?.chain[0]?.candidates).toHaveLength(0)
  })
})
