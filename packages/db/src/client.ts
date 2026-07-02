import path from 'path'
import { fileURLToPath } from 'url'

import type { DbLogger, Database, DatabaseOptions } from './types'
import { createPgliteDatabase } from './connections/pglite'
import { createPostgresDatabase } from './connections/postgres'

// ─── Global singleton ─────────────────────────────────────────

const g = globalThis as unknown as {
  __xllm_dbClient?: Database
  __xllm_postgresClient?: unknown
}

function getDbClient(): Database | null {
  return g.__xllm_dbClient ?? null
}
function setDbClient(client: Database | null) {
  g.__xllm_dbClient = client ?? undefined
}
function getPostgresClient(): unknown {
  return g.__xllm_postgresClient ?? null
}
function setPostgresClient(client: unknown) {
  g.__xllm_postgresClient = client ?? undefined
}

// ─── Public API ────────────────────────────────────────────────

export { getDbClient, setDbClient, getPostgresClient, setPostgresClient }

/**
 * Resolve the migrations folder path.
 * If `migrationsFolder` is provided, use it; otherwise derive from this file's location.
 */
function resolveMigrationsFolder(provided?: string): string {
  if (provided) return provided
  const __filename = fileURLToPath(import.meta.url)
  const __dirname = path.dirname(__filename)
  return path.join(__dirname, '..', 'migrations')
}

/**
 * Create a database connection (PGlite or Postgres).
 *
 * @param options  Connection options
 * @param logger   Logger instance from consumer
 * @param schema   Optional Drizzle schema object (for relationship mapping)
 * @returns The Database instance
 */
export async function createDbConnection(
  options: DatabaseOptions,
  logger: DbLogger,
  schema?: Record<string, unknown>,
): Promise<Database> {
  if (getDbClient()) {
    return getDbClient()!
  }

  const migrationsFolder = resolveMigrationsFolder(options.migrationsFolder)

  if (options.type === 'pglite') {
    const db = await createPgliteDatabase(
      options.dataDir ?? './.pglite',
      migrationsFolder,
      options.migrateOnBoot,
      logger,
      schema,
    )
    setDbClient(db)
    return db
  }

  // Postgres
  const { db, client } = await createPostgresDatabase(options, migrationsFolder, logger, schema)
  setDbClient(db)
  setPostgresClient(client)
  return db
}

/**
 * Get the singleton database client.
 * Throws if not yet initialized.
 */
export function getDatabase(): Database {
  const client = getDbClient()
  if (!client) {
    throw new Error('Database not initialized. Call createDbConnection() first.')
  }
  return client
}

/**
 * Close the database connection.
 */
export async function closeDb(): Promise<void> {
  if (getPostgresClient()) {
    const pgClient = getPostgresClient() as { end: () => Promise<void> }
    await pgClient.end()
  }
  setDbClient(null)
  setPostgresClient(null)
}
