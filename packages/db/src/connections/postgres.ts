import fs from 'fs'
import path from 'path'
import { createHash } from 'crypto'

import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import type { DbLogger, Database, DatabaseOptions } from '../types'

function buildConnectionString(options: DatabaseOptions): string {
  const { host, port, database, user, password, ssl } = options
  const sslParam = ssl ? '?sslmode=require' : ''
  return `postgres://${user}:${password}@${host}:${port}/${database}${sslParam}`
}

async function checkDatabaseExists(options: DatabaseOptions, _logger: DbLogger): Promise<boolean> {
  const checkConnString = buildConnectionString({ ...options, database: 'postgres' })
  const checkClient = postgres(checkConnString, { max: 1 })
  try {
    const result = await checkClient`SELECT 1 FROM pg_database WHERE datname = ${options.database}`
    await checkClient.end()
    return result.length > 0
  } catch (error) {
    await checkClient.end()
    throw error
  }
}

async function createDatabaseIfNotExists(
  options: DatabaseOptions,
  logger: DbLogger,
): Promise<void> {
  const createConnString = buildConnectionString({ ...options, database: 'postgres' })
  const createClient = postgres(createConnString, { max: 1 })
  try {
    await createClient.unsafe(`CREATE DATABASE "${options.database}"`)
    logger.trace({ database: options.database }, '[DB] Database created')
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === '42P04') {
      // already exists — silent
    } else {
      throw error
    }
  } finally {
    await createClient.end()
  }
}

/**
 * Run pending SQL migrations against a PostgreSQL database.
 *
 * This is the single migration mechanism shared by boot-time auto-migration
 * (`createPostgresDatabase` below) and the manual `bun run migrate` script
 * (`packages/db/src/migrate.ts`) — both must go through this exact function
 * so they track state in the same table with the same hash scheme. It
 * deliberately does NOT use drizzle-orm's official `migrate()`: that helper
 * requires `--> statement-breakpoint` markers between multi-statement files,
 * which this repo's hand-authored migrations don't use (they rely on
 * IF EXISTS/IF NOT EXISTS guards for idempotency instead, per project
 * convention), so it fails on files with more than one bare `;`-separated
 * statement.
 */
export async function runPostgresMigrations(
  client: postgres.Sql,
  migrationsFolder: string,
  logger: DbLogger,
): Promise<void> {
  logger.info('[DB] Running PostgreSQL migrations')

  await client.unsafe(`
    CREATE SCHEMA IF NOT EXISTS "drizzle";
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" SERIAL PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `)

  const existingResult = (await client`
    SELECT hash FROM "drizzle"."__drizzle_migrations"
  `) as Array<{ hash: string }>
  const appliedHashes = new Set<string>(existingResult.map((r) => r.hash))

  const migrationFiles = fs
    .readdirSync(migrationsFolder)
    .filter((f) => f.endsWith('.sql'))
    .toSorted()
  logger.info(
    { fileCount: migrationFiles.length, appliedCount: appliedHashes.size },
    '[DB] Scanning migrations',
  )

  let applied = 0
  let skipped = 0

  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(migrationsFolder, file), 'utf8')
    const hash = createHash('md5').update(content).digest('hex')

    if (appliedHashes.has(hash)) {
      logger.trace({ file }, '[DB] Skipped migration')
      skipped++
      continue
    }

    try {
      await client.unsafe(content)
      await client`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${Date.now()})`
      logger.info({ file }, '[DB] Migration applied')
      applied++
      appliedHashes.add(hash)
    } catch (err) {
      const msg = (err as Error).message
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate') ||
        msg.includes('does not exist')
      ) {
        await client`INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${Date.now()})`
        logger.info(
          { file, error: msg.split('\n')[0] },
          '[DB] Migration already applied or irrelevant',
        )
        skipped++
        appliedHashes.add(hash)
      } else {
        logger.error({ file, err }, '[DB] PostgreSQL migration failed')
        throw err
      }
    }
  }

  logger.info({ applied, skipped }, '[DB] Migrations complete')
}

/**
 * Create and initialize a PostgreSQL database.
 */
export async function createPostgresDatabase(
  options: DatabaseOptions,
  migrationsFolder: string,
  logger: DbLogger,
  schema?: Record<string, unknown>,
): Promise<{ db: Database; client: postgres.Sql }> {
  logger.trace('[DB] Initializing PostgreSQL')

  const dbExists = await checkDatabaseExists(options, logger)
  if (!dbExists) {
    logger.trace({ database: options.database }, '[DB] Creating database')
    await createDatabaseIfNotExists(options, logger)
  }

  const connString = buildConnectionString(options)

  // Validate connection (runs migrations in a temp connection)
  const validateClient = postgres(connString, { max: 1, onnotice: () => {} })
  try {
    if (options.migrateOnBoot) {
      await runPostgresMigrations(validateClient, migrationsFolder, logger)
    } else {
      logger.info('[DB] MIGRATE_ON_BOOT=false, skipping auto-migration')
    }
  } finally {
    await validateClient.end()
  }

  // Create persistent connection pool
  const pgClient = postgres(connString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  })
  const db = drizzlePostgres(pgClient, { schema })

  logger.trace('[DB] PostgreSQL ready')
  return { db, client: pgClient }
}
