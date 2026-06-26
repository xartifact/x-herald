// @ts-expect-error — BigInt.prototype.toJSON polyfill (see server.ts for rationale)
BigInt.prototype.toJSON = function () {
  return this.toString();
};

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { Hono } from 'hono';
import { drizzle as drizzlePglite } from 'drizzle-orm/pglite';

import { createEngine } from '../createEngine';
import * as schema from '../db';

import type { Database } from '../db/client';
import type { EngineInstance } from '../createEngine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Run PGlite migrations manually (in-memory DB has no persistent data dir,
 * so we bypass the file-based path in db/client.ts and execute the same SQL
 * files directly).
 */
async function runPgliteMigrations(pgliteClient: {
  exec: (sql: string) => Promise<unknown>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: Array<{ hash: string }> }>;
}): Promise<void> {
  const { createHash } = await import('crypto');
  const fs = await import('fs');
  const { extname } = await import('path');

  const migrationsFolder = path.join(__dirname, '..', 'db', 'migrations');

  // Ensure migration tracking table exists
  await pgliteClient.exec(`
    CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
      "id" SERIAL PRIMARY KEY,
      "hash" text NOT NULL,
      "created_at" bigint
    )
  `);

  // Get already-applied migrations
  const existingResult = await pgliteClient.query('SELECT hash FROM "__drizzle_migrations"');
  const appliedHashes = new Set<string>(existingResult.rows.map((r) => r.hash));

  // Read and sort migration files
  const migrationFiles = fs
    .readdirSync(migrationsFolder)
    .filter((f: string) => extname(f) === '.sql')
    .sort();

  for (const file of migrationFiles) {
    const content = fs.readFileSync(path.join(migrationsFolder, file), 'utf8');
    const hash = createHash('md5').update(content).digest('hex');

    if (appliedHashes.has(hash)) {
      continue;
    }

    try {
      await pgliteClient.exec(content);
      await pgliteClient.query(
        'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
        [hash, Date.now()]
      );
      appliedHashes.add(hash);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "already exists" / "duplicate" = object already exists, safe to skip
      // "does not exist" = object missing, likely schema already applied via another path
      if (
        msg.includes('already exists') ||
        msg.includes('duplicate') ||
        msg.includes('does not exist')
      ) {
        await pgliteClient.query(
          'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
          [hash, Date.now()]
        );
        appliedHashes.add(hash);
      } else {
        throw err;
      }
    }
  }
}

export async function createTestEngine(): Promise<EngineInstance> {
  // 1. Set required env vars
  process.env.ADMIN_PASSWORD = 'test';
  process.env.JWT_SECRET = 'test';
  process.env.DB_TYPE = 'pglite';
  process.env.DATABASE_URL = 'postgres://test:test@localhost:5432/test';
  process.env.LOG_LEVEL = 'error';

  // 2. Create PGlite in-memory DB
  const { PGlite } = await import('@electric-sql/pglite');
  const pgliteClient = new PGlite();

  // 3. Set timezone and create drizzle instance
  await pgliteClient.exec("SET timezone = 'UTC'");
  const db = drizzlePglite(pgliteClient, { schema }) as unknown as Database;

  // 4. Set the DB singleton via globalThis
  const g = globalThis as unknown as {
    __xllm_dbClient?: Database;
    __xllm_postgresClient?: unknown;
  };
  g.__xllm_dbClient = db;
  g.__xllm_postgresClient = undefined;

  // 5. Run migrations
  await runPgliteMigrations(pgliteClient);

  // 6. Create engine
  const engine = await createEngine({
    mountAdminAPI: true,
    skipConfigValidation: true,
  });

  return engine;
}

export async function destroyTestEngine(): Promise<void> {
  const g = globalThis as unknown as {
    __xllm_dbClient?: unknown;
    __xllm_postgresClient?: unknown;
  };
  g.__xllm_dbClient = undefined;
  g.__xllm_postgresClient = undefined;
}

export async function getAuthToken(app: Hono): Promise<string> {
  const res = await app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'test' }),
  });

  if (!res.ok) {
    throw new Error(`Login failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { token?: string };
  if (!data.token) {
    throw new Error(`No token in login response: ${JSON.stringify(data)}`);
  }

  return data.token;
}
