import { afterAll, beforeAll, describe, expect, it } from 'bun:test'
import { copyFileSync, mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { MIGRATIONS_FOLDER, runPgliteMigrations } from './index'

const DEFAULT_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001'
const logger = { trace() {}, info() {}, warn() {}, error() {} }

describe('workspace isolation migration', () => {
  let database: PGlite
  let migrationsBeforeWorkspaceIsolation: string

  beforeAll(async () => {
    migrationsBeforeWorkspaceIsolation = mkdtempSync(join(tmpdir(), 'x-herald-pre-workspace-'))
    for (const file of readdirSync(MIGRATIONS_FOLDER)) {
      if (!file.endsWith('.sql') || file.startsWith('0058_')) continue
      copyFileSync(join(MIGRATIONS_FOLDER, file), join(migrationsBeforeWorkspaceIsolation, file))
    }

    database = new PGlite()
    await runPgliteMigrations(database, migrationsBeforeWorkspaceIsolation, logger)
  })

  afterAll(async () => {
    await database.close()
    rmSync(migrationsBeforeWorkspaceIsolation, { recursive: true, force: true })
  })

  it('backfills legacy resource ownership through keys and access models', async () => {
    const keyRows = await database.query<{ id: string }>(
      `INSERT INTO virtual_keys (key, name) VALUES ('sk-legacy-workspace', 'legacy key') RETURNING id`,
    )
    const keyId = keyRows.rows[0]!.id
    const accessModelRows = await database.query<{ id: string }>(
      `INSERT INTO access_models (name, display_name, enabled) VALUES ('legacy-model', 'Legacy Model', true) RETURNING id`,
    )
    const accessModelId = accessModelRows.rows[0]!.id
    const routeRuleRows = await database.query<{ id: string }>(
      `INSERT INTO route_rules (access_model_id, graph, name) VALUES ($1, '{"nodes":[],"edges":[]}', 'legacy route') RETURNING id`,
      [accessModelId],
    )
    const logRows = await database.query<{ id: string }>(
      `INSERT INTO request_logs (virtual_key_id, model_name, status, response_time_ms) VALUES ($1, 'legacy-model', 'success', 12) RETURNING id`,
      [keyId],
    )
    const logId = logRows.rows[0]!.id
    await database.query(
      `INSERT INTO cost_records (request_log_id, model_name, total_cost) VALUES ($1, 'legacy-model', 0.25)`,
      [logId],
    )
    await database.query(
      `INSERT INTO intent_logs (virtual_key_id, intent_name, intent_source) VALUES ($1, 'legacy intent', 'classifier')`,
      [keyId],
    )

    await runPgliteMigrations(database, MIGRATIONS_FOLDER, logger)

    const ownership = await database.query<{
      key_workspace: string
      access_model_workspace: string
      route_rule_workspace: string
      log_workspace: string
      cost_workspace: string
      intent_workspace: string
    }>(
      `SELECT
        (SELECT workspace_id::text FROM virtual_keys WHERE id = $1) AS key_workspace,
        (SELECT workspace_id::text FROM access_models WHERE id = $2) AS access_model_workspace,
        (SELECT workspace_id::text FROM route_rules WHERE id = $3) AS route_rule_workspace,
        (SELECT workspace_id::text FROM request_logs WHERE id = $4) AS log_workspace,
        (SELECT workspace_id::text FROM cost_records WHERE request_log_id = $4::text) AS cost_workspace,
        (SELECT workspace_id::text FROM intent_logs WHERE virtual_key_id = $1) AS intent_workspace`,
      [keyId, accessModelId, routeRuleRows.rows[0]!.id, logId],
    )

    expect(ownership.rows[0]).toEqual({
      key_workspace: DEFAULT_WORKSPACE_ID,
      access_model_workspace: DEFAULT_WORKSPACE_ID,
      route_rule_workspace: DEFAULT_WORKSPACE_ID,
      log_workspace: DEFAULT_WORKSPACE_ID,
      cost_workspace: DEFAULT_WORKSPACE_ID,
      intent_workspace: DEFAULT_WORKSPACE_ID,
    })
  })
})
