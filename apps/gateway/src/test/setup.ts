// @ts-expect-error — BigInt.prototype.toJSON polyfill (see server.ts for rationale)
BigInt.prototype.toJSON = function () {
  return this.toString()
}

import { Hono } from 'hono'
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite'

import { MIGRATIONS_FOLDER, runPgliteMigrations } from '@xartifact/x-herald-db'

import { createEngine } from '../createEngine'
import * as schema from '../db'

import type { Database } from '../db/client'
import type { EngineInstance } from '../createEngine'

export async function createTestEngine(): Promise<EngineInstance> {
  // 1. Set required env vars
  process.env.ADMIN_PASSWORD = 'test'
  process.env.JWT_SECRET = 'test'
  process.env.DB_TYPE = 'pglite'
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test'
  process.env.LOG_LEVEL = 'error'

  // 2. Create PGlite in-memory DB
  const { PGlite } = await import('@electric-sql/pglite')
  const pgliteClient = new PGlite()

  // 3. Set timezone and create drizzle instance
  await pgliteClient.exec("SET timezone = 'UTC'")
  const db = drizzlePglite(pgliteClient, { schema }) as unknown as Database

  // 4. Set the DB singleton via globalThis
  const g = globalThis as unknown as {
    __xllm_dbClient?: Database
    __xllm_postgresClient?: unknown
  }
  g.__xllm_dbClient = db
  g.__xllm_postgresClient = undefined

  // 5. Run migrations using the shared folder — keeps tests and runtime in sync
  //    (no more dual directories in apps/gateway + packages/db).
  await runPgliteMigrations(pgliteClient, MIGRATIONS_FOLDER, {
    trace() {},
    info() {},
    warn() {},
    error() {},
  })

  // 6. Create engine
  const engine = await createEngine({
    mountAdminAPI: true,
    skipConfigValidation: true,
  })

  return engine
}

export async function destroyTestEngine(): Promise<void> {
  const g = globalThis as unknown as {
    __xllm_dbClient?: unknown
    __xllm_postgresClient?: unknown
  }
  g.__xllm_dbClient = undefined
  g.__xllm_postgresClient = undefined
}

export async function getAuthToken(app: Hono): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test' }),
  })

  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${res.statusText}`)
  }

  const data = (await res.json()) as { token?: string }
  if (!data.token) {
    throw new Error(`No token in login response: ${JSON.stringify(data)}`)
  }
  return data.token
}
