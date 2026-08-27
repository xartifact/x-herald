import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import type { DbLogger, Database } from '../types'

const PGLITE_LOCK_FILE = '.xllm.pid'

/**
 * Inspect the process holding the .xllm.pid lock so the error message
 * can identify which PID/command to kill.
 */
function describeLockHolder(pid: number): { command: string; elapsed: string } | null {
  try {
    const out = execSync(`ps -p ${pid} -o pid=,command=,etime=`, {
      encoding: 'utf-8',
      timeout: 1000,
    }).trim()
    if (!out) return null
    const trimmed = out.replace(/^\s+/, '')
    const match = trimmed.match(/^\d+\s+(.+?)\s+(\d{2}:\d{2}:\d{2}|\d+:\d{2})\s*$/)
    if (!match) return { command: trimmed, elapsed: 'unknown' }
    return { command: match[1]!.trim(), elapsed: match[2]! }
  } catch {
    return null
  }
}

/**
 * Acquire an exclusive lock for the PGlite data directory.
 * Throws a descriptive Error when the lock is held by another live process,
 * including the holder's PID, command, elapsed time, and lock file path.
 */
function acquirePgliteLock(dataDir: string, logger: DbLogger): boolean {
  const lockPath = path.join(dataDir, PGLITE_LOCK_FILE)
  try {
    if (fs.existsSync(lockPath)) {
      const existingPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10)
      if (existingPid === process.pid) return true

      let holderAlive = false
      try {
        process.kill(existingPid, 0)
        holderAlive = true
      } catch {
        // process exited — stale lock will be cleaned up below
      }

      if (holderAlive) {
        const info = describeLockHolder(existingPid)
        logger.error(
          {
            existingPid,
            command: info?.command,
            elapsed: info?.elapsed,
            lockPath,
            dataDir,
          },
          '[DB] PGlite data directory is locked by another process',
        )
        const cmdSuffix = info?.command ? ` "${info.command}"` : ''
        const elapsedSuffix = info?.elapsed ? ` (running for ${info.elapsed})` : ''
        throw new Error(
          `[DB] PGlite data directory ${dataDir} is locked by PID ${existingPid}${cmdSuffix}${elapsedSuffix}. ` +
            `Lock file: ${lockPath}. ` +
            `Stop the holder with: kill ${existingPid}` +
            (info?.command
              ? ''
              : ` (or delete the lock file manually if the process has already exited).`),
        )
      }

      fs.unlinkSync(lockPath)
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
    if (err instanceof Error && err.message.startsWith('[DB]')) throw err
    logger.warn({ err }, '[DB] PGlite lock operation failed, proceeding anyway')
    return true
  }
}

/**
 * Run pending SQL migrations against a PGlite instance.
 *
 * Shares its mechanism (multi-statement-tolerant `.exec()`, md5 file hash,
 * `drizzle.__drizzle_migrations` tracking table) with
 * {@link import('./postgres').runPostgresMigrations} so dev/test PGlite and
 * the real PostgreSQL paths never diverge on what "applied" means.
 */
export async function runPgliteMigrations(
  pgliteClient: {
    exec: (sql: string) => Promise<unknown>
    query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ hash: string }> }>
  },
  migrationsFolder: string,
  logger: DbLogger,
): Promise<void> {
  const { createHash } = await import('crypto')

  await pgliteClient.exec(`
    CREATE SCHEMA IF NOT EXISTS "drizzle";
    CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
      "id" SERIAL PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `)

  const existingResult = await pgliteClient.query(
    'SELECT hash FROM "drizzle"."__drizzle_migrations"',
  )
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
        'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
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
          'INSERT INTO "drizzle"."__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
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
    throw new Error('[DB] Failed to acquire PGlite lock')
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
