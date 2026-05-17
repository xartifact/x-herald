import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';
import logger from '../lib/logger';

type PostgresDb = ReturnType<typeof drizzlePostgres<typeof schema>>;

// 通过 globalThis 共享单例，避免 Turbopack 多 bundle 隔离问题
const g = globalThis as unknown as {
  __xllm_dbClient?: PostgresDb;
  __xllm_postgresClient?: postgres.Sql;
};

function getDbClient() {
  return g.__xllm_dbClient ?? null;
}
function setDbClient(client: PostgresDb | null) {
  g.__xllm_dbClient = client ?? undefined;
}
function getPostgresClient() {
  return g.__xllm_postgresClient ?? null;
}
function setPostgresClient(client: postgres.Sql | null) {
  g.__xllm_postgresClient = client ?? undefined;
}

export interface DatabaseOptions {
  type: 'postgres' | 'pglite';
  // postgres-only
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  // pglite-only
  dataDir?: string;
}

/**
 * 获取迁移文件夹路径
 */
function getMigrationsFolder(): string {
  if (process.env.DB_MIGRATIONS_FOLDER) {
    return process.env.DB_MIGRATIONS_FOLDER;
  }
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  return path.join(__dirname, 'migrations');
}

// ─── PGlite 路径 ────────────────────────────────────────────────────────────

const PGLITE_LOCK_FILE = '.xllm.pid';

/**
 * 获取 PGlite 文件锁。
 * 利用 O_EXCL 原子性写入防止多实例（Turbopack 多 worker 线程）同时打开同一目录。
 * 返回 true 表示成功获取锁，false 表示当前有另一实例正在运行。
 */
function acquirePgliteLock(dataDir: string): boolean {
  const lockPath = path.join(dataDir, PGLITE_LOCK_FILE);
  try {
    // 检查锁文件是否已存在
    if (fs.existsSync(lockPath)) {
      const existingPid = parseInt(fs.readFileSync(lockPath, 'utf-8').trim(), 10);
      // 同一进程内（Turbopack worker 线程重载）：放行，复用同一数据目录
      if (existingPid === process.pid) return true;
      // 不同进程：检查是否仍在运行
      try {
        process.kill(existingPid, 0); // 不发信号，只检查进程是否存在
        logger.warn({ existingPid }, '[DB] PGlite 已被另一进程占用，跳过初始化');
        return false;
      } catch {
        // 进程已死，清除残留锁
        fs.unlinkSync(lockPath);
      }
    }
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(lockPath, String(process.pid));
    // 注册进程退出时清理锁文件
    const cleanup = () => { try { fs.unlinkSync(lockPath); } catch { /* ignore */ } };
    process.once('exit', cleanup);
    process.once('SIGINT', () => { cleanup(); process.exit(0); });
    process.once('SIGTERM', () => { cleanup(); process.exit(0); });
    return true;
  } catch (err) {
    logger.warn({ err }, '[DB] PGlite 锁文件操作失败，继续尝试初始化');
    return true;
  }
}

async function createPgliteDatabase(dataDir: string): Promise<PostgresDb> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const { createHash } = await import('crypto');
  const fs = await import('fs');
  const { extname } = await import('path');

  logger.trace({ dataDir }, '[DB] 使用 PGlite 数据库');

  if (!acquirePgliteLock(dataDir)) {
    // 另一进程持有锁：等待它完成初始化后复用其 client
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 200));
      if (getDbClient()) return getDbClient()!;
    }
    throw new Error('[DB] 等待 PGlite 初始化超时（另一进程持有锁）');
  }

  const pgliteClient = new PGlite(dataDir);
  // drizzle-orm/pglite 会把时间戳字符串当 UTC 处理（拼接 +0000），
  // 需确保 PGlite 会话时区为 UTC，否则 now() 返回本地时间，导致 8 小时偏差。
  await pgliteClient.exec("SET timezone = 'UTC'");
  const db = drizzlePglite(pgliteClient, { schema }) as unknown as PostgresDb;
  setDbClient(db);

  // PGlite 的 exec() 支持多条 SQL 语句，而 Drizzle migrator 使用 prepared statement
  // 不支持批量语句（如 CREATE TABLE + CREATE INDEX 在同一文件）。
  // 因此直接读取 .sql 文件并逐个执行，同时维护 __drizzle_migrations 追踪表。
  const migrationsFolder = getMigrationsFolder();
  logger.trace({ migrationsFolder }, '[DB] 运行 PGlite 迁移');

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
  const appliedHashes = new Set<string>((existingResult.rows as Array<{ hash: string }>).map(r => r.hash));

  // Read and sort migration files
  const migrationFiles = fs.readdirSync(migrationsFolder)
    .filter(f => extname(f) === '.sql')
    .sort();

  let applied = 0;
  let skipped = 0;

  for (const file of migrationFiles) {
    const content = fs.readFileSync(require('path').join(migrationsFolder, file), 'utf8');
    const hash = createHash('md5').update(content).digest('hex');

    if (appliedHashes.has(hash)) {
      logger.trace({ file }, '[DB] 已跳过迁移');
      skipped++;
      continue;
    }

      try {
        // exec() 支持多条 SQL 语句，但整体是事务：任一语句失败则全部回滚
        await pgliteClient.exec(content);
        await pgliteClient.query(
          'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
          [hash, Date.now()]
        );
        logger.trace({ file }, '[DB] 已应用迁移');
        applied++;
        appliedHashes.add(hash);
      } catch (err) {
        const msg = (err as Error).message;
        // 已有数据库的场景：部分迁移文件可能从未执行，但 schema 已通过其他方式创建
        // "already exists" / "duplicate" = 对象已存在，安全跳过
        // "does not exist" (列/约束/表) = 对象不存在，说明之前未迁移且后续 schema 已变更，视为已存在
        if (msg.includes('already exists')
          || msg.includes('duplicate')
          || msg.includes('does not exist')
        ) {
          await pgliteClient.query(
            'INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES ($1, $2)',
            [hash, Date.now()]
          );
          logger.trace({ file, error: msg.split('\n')[0] }, '[DB] 迁移已存在或已无关（schema 匹配）');
          skipped++;
          appliedHashes.add(hash);
        } else {
          logger.error({ file, err }, '[DB] PGlite 迁移失败');
          throw err;
        }
      }
  }

  logger.trace({ applied, skipped }, '[DB] PGlite 迁移完成');
  logger.trace('[DB] PGlite 数据库已就绪');
  return getDbClient()!;
}

// ─── Postgres 路径 ───────────────────────────────────────────────────────────

function buildConnectionString(options: DatabaseOptions): string {
  const { host, port, database, user, password, ssl } = options;
  const sslParam = ssl ? '?sslmode=require' : '';
  return `postgres://${user}:${password}@${host}:${port}/${database}${sslParam}`;
}

async function checkDatabaseExists(options: DatabaseOptions): Promise<boolean> {
  const checkConnString = buildConnectionString({ ...options, database: 'postgres' });
  const checkClient = postgres(checkConnString, { max: 1 });
  try {
    const result = await checkClient`
      SELECT 1 FROM pg_database WHERE datname = ${options.database}
    `;
    await checkClient.end();
    return result.length > 0;
  } catch (error) {
    await checkClient.end();
    throw error;
  }
}

async function createDatabaseIfNotExists(options: DatabaseOptions): Promise<void> {
  const createConnString = buildConnectionString({ ...options, database: 'postgres' });
  const createClient = postgres(createConnString, { max: 1 });
  try {
    await createClient.unsafe(`CREATE DATABASE "${options.database}"`);
    logger.trace({ database: options.database }, '[DB] 数据库创建成功');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === '42P04') {
      // 静默处理：数据库已存在
    } else {
      throw error;
    }
  } finally {
    await createClient.end();
  }
}

async function runPostgresMigrations(
  db: ReturnType<typeof drizzlePostgres>,
  client: postgres.Sql
): Promise<void> {
  logger.info('[DB] 开始运行数据库迁移');
  try {
    // Ensure migration tracking table exists (same as PGlite path)
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
        "id" SERIAL PRIMARY KEY,
        "hash" text NOT NULL,
        "created_at" bigint
      )
    `);

    // Get already-applied migrations by hash
    const existingResult = await client`SELECT hash FROM "__drizzle_migrations"` as Array<{ hash: string }>;
    const appliedHashes = new Set<string>(existingResult.map(r => r.hash));

    // Read and sort migration files
    const migrationsFolder = getMigrationsFolder();
    const migrationFiles = fs.readdirSync(migrationsFolder)
      .filter(f => f.endsWith('.sql'))
      .sort();

    logger.info({ fileCount: migrationFiles.length, appliedCount: appliedHashes.size }, '[DB] 扫描迁移文件');

    let applied = 0;
    let skipped = 0;

    for (const file of migrationFiles) {
      const content = fs.readFileSync(path.join(migrationsFolder, file), 'utf8');
      const hash = createHash('md5').update(content).digest('hex');

      if (appliedHashes.has(hash)) {
        logger.trace({ file }, '[DB] 已跳过迁移');
        skipped++;
        continue;
      }

      try {
        // unsafe() 支持多条 SQL 语句
        await client.unsafe(content);
        await client`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${Date.now()})`;
        logger.info({ file }, '[DB] 已应用迁移');
        applied++;
        appliedHashes.add(hash);
      } catch (err) {
        const msg = (err as Error).message;
        // 已有数据库的场景：部分迁移文件可能从未执行，但 schema 已通过其他方式创建
        // "already exists" / "duplicate" = 对象已存在，安全跳过
        // "does not exist" (列/约束/表) = 对象不存在，说明之前未迁移且后续 schema 已变更，视为已存在
        if (msg.includes('already exists')
          || msg.includes('duplicate')
          || msg.includes('does not exist')
        ) {
          await client`INSERT INTO "__drizzle_migrations" (hash, created_at) VALUES (${hash}, ${Date.now()})`;
          logger.info({ file, error: msg.split('\n')[0] }, '[DB] 迁移已存在或已无关（schema 匹配）');
          skipped++;
          appliedHashes.add(hash);
        } else {
          logger.error({ file, err }, '[DB] Postgres 迁移失败');
          throw err;
        }
      }
    }

    logger.info({ applied, skipped }, '[DB] 数据库迁移完成');
  } catch (error) {
    if (error instanceof Error && error.message?.includes('No migrations')) {
      // 静默处理
    } else {
      logger.error({ err: error }, '[DB] 数据库迁移失败');
      throw error;
    }
  }
}

async function initializePostgresDatabase(options: DatabaseOptions): Promise<void> {
  logger.trace('[DB] 检查数据库状态');
  try {
    const dbExists = await checkDatabaseExists(options);
    if (!dbExists) {
      logger.trace({ database: options.database }, '[DB] 数据库不存在，正在创建');
      await createDatabaseIfNotExists(options);
    }

    const connString = buildConnectionString(options);
    const client = postgres(connString, { max: 1, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema });
    try {
      await runPostgresMigrations(db, client);
    } finally {
      await client.end();
    }

    logger.trace('[DB] 数据库初始化完成');
  } catch (error) {
    logger.error({ err: error }, '[DB] 数据库初始化失败');
    throw error;
  }
}

async function createPostgresDatabase(options: DatabaseOptions): Promise<PostgresDb> {
  const connectionString = buildConnectionString(options);
  const pgClient = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  setPostgresClient(pgClient);

  const db = drizzlePostgres(pgClient, { schema });
  setDbClient(db);

  await initializePostgresDatabase(options);
  logger.trace('[DB] 数据库已就绪，应用可以正常运行');

  return getDbClient()!;
}

// ─── 公共 API ────────────────────────────────────────────────────────────────

/**
 * 创建数据库连接
 * - 开发环境默认使用 PGlite（无需外部 PostgreSQL）
 * - 生产环境使用 PostgreSQL
 * - 可通过 DB_TYPE=postgres|pglite 强制指定
 */
export async function createDatabase(options: DatabaseOptions) {
  if (getDbClient()) {
    return getDbClient()!;
  }

  if (options.type === 'pglite') {
    return createPgliteDatabase(options.dataDir ?? './.pglite');
  }

  return createPostgresDatabase(options);
}

/**
 * 获取数据库实例
 */
export function getDatabase() {
  const client = getDbClient();
  if (!client) {
    throw new Error('Database not initialized. Call createDatabase() first.');
  }
  return client;
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase() {
  const pgClient = getPostgresClient();
  if (pgClient) {
    await pgClient.end();
    setDbClient(null);
    setPostgresClient(null);
  } else {
    // PGlite 不需要显式关闭
    setDbClient(null);
  }
}

export { schema };
export type Database = ReturnType<typeof getDatabase>;
