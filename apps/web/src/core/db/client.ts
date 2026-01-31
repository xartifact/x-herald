import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import * as schema from './schema';
import path from 'path';
import { fileURLToPath } from 'url';

let dbClient: ReturnType<typeof drizzle> | null = null;
let postgresClient: postgres.Sql | null = null;

export interface DatabaseOptions {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
}

/**
 * 构建 PostgreSQL 连接字符串
 */
function buildConnectionString(options: DatabaseOptions): string {
  const { host, port, database, user, password, ssl } = options;
  const sslParam = ssl ? '?sslmode=require' : '';
  return `postgres://${user}:${password}@${host}:${port}/${database}${sslParam}`;
}

/**
 * 检查数据库是否存在
 */
async function checkDatabaseExists(options: DatabaseOptions): Promise<boolean> {
  // 连接到 postgres 默认数据库来检查目标数据库是否存在
  const checkConnString = buildConnectionString({
    ...options,
    database: 'postgres',
  });

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

/**
 * 创建数据库
 */
async function createDatabaseIfNotExists(options: DatabaseOptions): Promise<void> {
  const createConnString = buildConnectionString({
    ...options,
    database: 'postgres',
  });

  const createClient = postgres(createConnString, { max: 1 });

  try {
    // 使用 unsafe 执行 CREATE DATABASE（不能使用参数化查询）
    await createClient.unsafe(`CREATE DATABASE "${options.database}"`);
    console.log(`✅ 数据库 "${options.database}" 创建成功`);
  } catch (error) {
    // 如果数据库已存在，忽略错误
    if (error instanceof Error && 'code' in error && error.code === '42P04') {
      console.log(`ℹ️  数据库 "${options.database}" 已存在`);
    } else {
      throw error;
    }
  } finally {
    await createClient.end();
  }
}

/**
 * 检查表是否存在
 */
async function checkTablesExist(client: postgres.Sql): Promise<boolean> {
  try {
    const result = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'providers'
      ) as exists
    `;
    return result[0]?.exists || false;
  } catch (error) {
    return false;
  }
}

/**
 * 运行数据库迁移
 */
async function runMigrations(db: ReturnType<typeof drizzle>): Promise<void> {
  console.log('🔄 开始运行数据库迁移...');

  try {
    // 获取迁移文件夹路径
    // 1. 优先使用环境变量（用于生产环境）
    // 2. 使用 import.meta.url 解析相对路径（开发环境）
    let migrationsFolder: string;

    if (process.env.DB_MIGRATIONS_FOLDER) {
      migrationsFolder = process.env.DB_MIGRATIONS_FOLDER;
    } else {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      migrationsFolder = path.join(__dirname, 'migrations');
    }

    console.log('📁 迁移文件夹:', migrationsFolder);

    await migrate(db, { migrationsFolder });
    console.log('✅ 数据库迁移完成');
  } catch (error) {
    // 如果是 "No migrations to run" 错误，忽略
    if (error instanceof Error && error.message?.includes('No migrations')) {
      console.log('ℹ️  没有新的迁移需要运行');
    } else if (error instanceof Error) {
      console.error('❌ 数据库迁移失败:', error);
      console.error('错误详情:', error.message);
      throw error;
    } else {
      console.error('❌ 数据库迁移失败:', error);
      throw error;
    }
  }
}

/**
 * 初始化数据库
 * - 检查数据库是否存在，不存在则创建
 * - 检查表是否存在，不存在则运行迁移
 */
async function initializeDatabase(options: DatabaseOptions): Promise<void> {
  console.log('🔍 检查数据库状态...');

  try {
    // 1. 检查并创建数据库
    const dbExists = await checkDatabaseExists(options);

    if (!dbExists) {
      console.log(`📦 数据库 "${options.database}" 不存在，正在创建...`);
      await createDatabaseIfNotExists(options);
    } else {
      console.log(`✅ 数据库 "${options.database}" 已存在`);
    }

    // 2. 连接到目标数据库
    const connString = buildConnectionString(options);
    const client = postgres(connString, { max: 1 });
    const db = drizzle(client, { schema });

    try {
      // 3. 检查表是否存在
      const tablesExist = await checkTablesExist(client);

      if (!tablesExist) {
        console.log('📋 数据表不存在，正在运行迁移...');
        await runMigrations(db);
      } else {
        console.log('✅ 数据表已存在，检查是否有新迁移...');
        // 即使表存在，也尝试运行迁移（幂等性）
        await runMigrations(db);
      }
    } finally {
      await client.end();
    }

    console.log('✅ 数据库初始化完成\n');
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}

/**
 * 创建数据库连接（异步版本，推荐使用）
 */
export async function createDatabase(options: DatabaseOptions) {
  if (dbClient) {
    return dbClient;
  }

  const connectionString = buildConnectionString(options);

  postgresClient = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  dbClient = drizzle(postgresClient, { schema });

  // 同步等待数据库初始化完成
  await initializeDatabase(options);
  console.log('🚀 数据库已就绪，应用可以正常运行');

  return dbClient;
}

/**
 * 创建数据库连接（同步版本，不推荐）
 * @deprecated 使用异步版本 createDatabase() 代替
 */
export function createDatabaseSync(options: DatabaseOptions) {
  if (dbClient) {
    return dbClient;
  }

  const connectionString = buildConnectionString(options);

  postgresClient = postgres(connectionString, {
    max: 10,
    idle_timeout: 20,
    connect_timeout: 10,
  });

  dbClient = drizzle(postgresClient, { schema });

  // 异步初始化，不阻塞（旧版行为）
  initializeDatabase(options)
    .then(() => {
      console.log('🚀 数据库已就绪，应用可以正常运行');
    })
    .catch((error) => {
      console.error('❌ 数据库初始化失败，应用可能无法正常工作:', error);
    });

  return dbClient;
}

/**
 * 获取数据库实例
 */
export function getDatabase() {
  if (!dbClient) {
    throw new Error('Database not initialized. Call createDatabase() first.');
  }
  return dbClient;
}

/**
 * 关闭数据库连接
 */
export async function closeDatabase() {
  if (postgresClient) {
    await postgresClient.end();
    dbClient = null;
    postgresClient = null;
  }
}

export { schema };
export type Database = ReturnType<typeof getDatabase>;
