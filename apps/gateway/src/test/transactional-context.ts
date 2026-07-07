import { beforeEach, afterEach } from 'bun:test'
import { getDatabase } from '../db/client'

export interface TransactionalTest {
  db: ReturnType<typeof getDatabase>
}

const TABLE_NAMES = [
  'providers',
  'model_groups',
  'model_instances',
  'model_group_memberships',
  'virtual_keys',
  'key_usage_daily',
  'request_logs',
  'request_attempts',
  'client_requested_models',
  'model_request_stats',
  'health_targets',
  'health_runs',
  'gateway_configs',
  'circuit_breaker_events',
  'instance_perf_snapshots',
  'anomaly_events',
  'cost_records',
  'access_models',
  'model_routes',
]

export function transactionalTest() {
  const db = getDatabase()

  beforeEach(async () => {
    await db.execute('BEGIN')
  })

  afterEach(async () => {
    await db.execute('ROLLBACK')
  })
}

export async function truncateAllTables(db = getDatabase()) {
  for (const table of TABLE_NAMES) {
    await db.execute(`TRUNCATE TABLE "${table}" CASCADE`)
  }
}
