/**
 * E2E roundtrip: selectionReason + filteredOut 从 routeChain JSONB 经
 * getRoutingTraceDetail 原样透出（详情页渲染依赖这两个字段）。
 */
import { describe, it, expect, beforeAll, afterAll } from 'bun:test'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'

import {
  MIGRATIONS_FOLDER,
  requestLogs,
  requestAttempts,
  runPgliteMigrations,
} from '@xartifact/x-herald-db'

import type { Database } from '../../db/client'
import { getRoutingTraceDetail } from './service'

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

describe('routing trace reason roundtrip', () => {
  it('exposes selectionReason and filteredOut through the detail API', async () => {
    if (!db) throw new Error('db not initialized')
    const rgroupId = crypto.randomUUID()
    const chain = {
      requestedModel: 'gpt-4',
      accessModelName: 'gpt-4',
      chain: [
        {
          index: 0,
          kind: 'single',
          actionType: 'priority',
          resolvedGroupId: 'g1',
          resolvedGroupName: 'GPT 主组',
          candidates: [
            {
              candidateIndex: 0,
              chainStepIndex: 0,
              chainStepKind: 'single',
              instanceId: 'i1',
              instanceName: 'gpt-4o',
              providerId: 'p1',
              providerName: 'OpenAI',
              priority: 0,
              strategy: 'priority',
              groupName: 'GPT 主组',
              selectionReason: 'primary selection: priority 0, created 2025-01-01',
            },
            {
              candidateIndex: 1,
              chainStepIndex: 0,
              chainStepKind: 'single',
              instanceId: 'i2',
              instanceName: 'gpt-4-turbo',
              providerId: 'p1',
              providerName: 'OpenAI',
              priority: 1,
              strategy: 'priority',
              groupName: 'GPT 主组',
              selectionReason: 'failover candidate #2: priority 1, created 2025-02-01',
            },
          ],
          filteredOut: [
            { instanceName: 'gpt-4o-mini', reason: 'streaming not supported' },
            { instanceName: 'gpt-3.5-turbo', reason: 'circuit breaker open' },
          ],
        },
      ],
    }
    const logId = crypto.randomUUID()
    await db.insert(requestLogs).values({
      id: logId,
      requestGroupId: rgroupId,
      candidateIndex: 0,
      modelName: 'gpt-4',
      originalModelName: 'gpt-4',
      status: 'success',
      statusCode: 200,
      responseTimeMs: 1234,
      metadata: { routing: { routeChain: chain, actualModelName: 'gpt-4o' } },
      createdAt: new Date(),
    })
    await db.insert(requestAttempts).values({
      id: crypto.randomUUID(),
      requestLogId: logId,
      requestGroupId: rgroupId,
      candidateIndex: 0,
      status: 'success',
      statusCode: 200,
      durationMs: 1234,
      providerName: 'OpenAI',
    })
    await db.insert(requestAttempts).values({
      id: crypto.randomUUID(),
      requestLogId: logId,
      requestGroupId: rgroupId,
      candidateIndex: 1,
      status: 'failed',
      statusCode: 500,
      durationMs: 20,
      providerName: 'OpenAI',
    })

    const detail = await getRoutingTraceDetail(logId)
    expect(detail).not.toBeNull()
    expect(detail!.chain[0].candidates[0].selectionReason).toContain('priority 0')
    expect(detail!.chain[0].candidates[0].matched).toBe(true)
    expect(detail!.chain[0].filteredOut).toHaveLength(2)
    expect(detail!.chain[0].filteredOut![0].instanceName).toBe('gpt-4o-mini')
    expect(detail!.chain[0].filteredOut![0].reason).toBe('streaming not supported')
    expect(detail!.finalCandidate?.instanceName).toBe('gpt-4o')
  })
})
