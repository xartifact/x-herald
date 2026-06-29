/**
 * Thin wrapper around @xartifact/x-llm-gateway-db.
 *
 * Exposes the same public API as before (createDatabase, getDatabase, closeDatabase)
 * so that all 75+ consumers importing ../../db/client need zero changes.
 *
 * The heavy lifting (connection management, migration runner, PGlite/Postgres switching)
 * lives in packages/db. This file only wires in gateway-specific config and logger.
 */
import {
  createDbConnection,
  getDatabase as getDbClient,
  closeDb,
} from '@xartifact/x-llm-gateway-db';
import type { DatabaseOptions as DbOpts } from '@xartifact/x-llm-gateway-db';

import { MIGRATE_ON_BOOT } from '../config/env';
import logger from '../lib/logger';
import * as schema from '@xartifact/x-llm-gateway-db';

export type { Database, DbClient, Transaction, DatabaseOptions } from '@xartifact/x-llm-gateway-db';

export async function createDatabase(options: {
  type: 'postgres' | 'pglite';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  dataDir?: string;
}): Promise<ReturnType<typeof getDatabase>> {
  return createDbConnection(
    {
      ...options,
      migrateOnBoot: MIGRATE_ON_BOOT,
    },
    logger,
    schema,
  );
}

export function getDatabase(): ReturnType<typeof getDbClient> {
  return getDbClient();
}

export async function closeDatabase(): Promise<void> {
  return closeDb();
}

export { schema };
