import path from 'path';
import { fileURLToPath } from 'url';

import { drizzle as drizzlePostgres } from 'drizzle-orm/postgres-js';
import { migrate as migratePostgres } from 'drizzle-orm/postgres-js/migrator';
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

async function createPgliteDatabase(dataDir: string): Promise<PostgresDb> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle: drizzlePglite } = await import('drizzle-orm/pglite');
  const { migrate: migratePglite } = await import('drizzle-orm/pglite/migrator');

  logger.trace({ dataDir }, '[DB] 使用 PGlite 数据库');

  const pgliteClient = new PGlite(dataDir);
  const db = drizzlePglite(pgliteClient, { schema }) as unknown as PostgresDb;
  setDbClient(db);

  const migrationsFolder = getMigrationsFolder();
  logger.trace({ migrationsFolder }, '[DB] 运行 PGlite 迁移');

  try {
    await migratePglite(db as unknown as Parameters<typeof migratePglite>[0], { migrationsFolder });
    logger.trace('[DB] PGlite 迁移完成');
  } catch (error) {
    if (error instanceof Error && error.message?.includes('No migrations')) {
      // 静默处理
    } else {
      logger.error({ err: error }, '[DB] PGlite 迁移失败');
      throw error;
    }
  }

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
    logger.trace(`[DB] 数据库 "${options.database}" 创建成功`);
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

async function runPostgresMigrations(db: ReturnType<typeof drizzlePostgres>): Promise<void> {
  logger.trace('[DB] 开始运行数据库迁移');
  try {
    const migrationsFolder = getMigrationsFolder();
    logger.trace({ migrationsFolder }, '[DB] 迁移文件夹');
    await migratePostgres(db, { migrationsFolder });
    logger.trace('[DB] 数据库迁移完成');
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
      logger.trace(`[DB] 数据库 "${options.database}" 不存在，正在创建`);
      await createDatabaseIfNotExists(options);
    }

    const connString = buildConnectionString(options);
    const client = postgres(connString, { max: 1, onnotice: () => {} });
    const db = drizzlePostgres(client, { schema });
    try {
      await runPostgresMigrations(db);
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
