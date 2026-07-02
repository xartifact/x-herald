import fs from 'fs'
import path from 'path'

import type { DbLogger, Database } from '../types'

const PGLITE_LOCK_FILE = '.xllm.pid'

/**
 * Acquire an exclusive lock for the PGlite data directory.
 * Prevents multiple Bun/worker instances from opening the same dir.
 */
function acquirePgliteLock(dataDir: string, logger: DbLogger): boolean {
  const lockPath = path.join(dataDir, PGLITE_LOCK_FILE)
  try {
    if (fs.existsSync(lockPath)) {
      const existingPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10)
      if (existingPid === process.pid) return true
      try {
        process.kill(existingPid, 0)
        logger.warn({ existingPid }, '[DB] PGlite already in use by another process')
        return false
      } catch {
        fs.unlinkSync(lockPath)
      }
    }
    fs.mkdirSync(dataDir, { recursive: true })
    fs.writeFileSync(lockPath, String(process.pid))
    const cleanup = () => {
      try {
        fs.unlinkSync(lockPath)
      } catch {
        /* ignore */
      }
    }
    process.once('exit', cleanup)
    process.once('SIGINT', () => {
      cleanup()
      process.exit(0)
    })
    process.once('SIGTERM', () => {
      cleanup()
      process.exit(0)
    })
    return true
  } catch (err) {
    logger.warn({ err }, '[DB] PGlite lock operation failed, proceeding anyway')
    return true
  }
}

/**
 * Run pending SQL migrations against a PGlite instance.
 */
async function runPgliteMigrations(
  pgliteClient: {
    exec: (sql: string) => Promise<unknown>
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ hash: string }> }>
  },
  migrationsFolder: string,
  logger: DbLogger,
): Promise<void> {
  const { createHash } = await import('crypto')

  await pgliteClient.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      "id" SERIAL PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `)

  const existingResult = await pgliteClient.query('SELECT hash FROM "__drizzle_migrations"')
  const appliedHashes = new Set<string>(
    (existingResult.rows as Array<{ hash: string }>).map((r) => r.hash),
  )
  const extname = (await import('path')).extname

  const migrationFiles = fs
    .readdirSync(migrationsFolder)
    .filter((f) => extname(f) === '.sql')
    .toSorted()

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
      await pgliteClient.exec(content)
      await pgliteClient.query(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [hash, Date.now()],
      )
      logger.trace({ file }, '[DB] Migration applied')
      applied++
      appliedHashes.add(hash)
    } catch (err) {
      const msg = (err as Error).message
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate') ||
        msg.includes('does not exist')
      ) {
        await pgliteClient.query(
          'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
          [hash, Date.now()],
        )
        logger.trace(
          { file, error: msg.split('\n')[0] },
          '[DB] Migration already applied or irrelevant',
        )
        skipped++
        appliedHashes.add(hash)
      } else {
        logger.error({ file, err }, '[DB] PGlite migration failed')
        throw err
      }
    }
  }

  logger.trace({ applied, skipped }, '[DB] PGlite migrations complete')
}

/**
 * Create and initialize a PGlite database.
 */
export async function createPgliteDatabase(
  dataDir: string,
  migrationsFolder: string,
  migrateOnBoot: boolean,
  logger: DbLogger,
  schema?: Record<string, unknown>,
): Promise<Database> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite')

  logger.trace({ dataDir }, '[DB] Using PGlite')

  if (!acquirePgliteLock(dataDir, logger)) {
    throw new Error('[DB] Timeout waiting for PGlite lock (another process holds it)')
  }

  const pgliteClient = new PGlite(dataDir)
  await pgliteClient.exec("SET timezone = 'UTC'")
  const db = drizzlePglite(pgliteClient, { schema }) as unknown as Database

  if (migrateOnBoot) {
    await runPgliteMigrations(pgliteClient, migrationsFolder, logger)
  } else {
    logger.info('[DB] MIGRATE_ON_BOOT=false, skipping auto-migration')
  }

  return db
}
