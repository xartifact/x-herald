/**
 * 将生产导出的配置（prod_config.sql）导入本地 PGlite。
 *
 * - 先执行 packages/db/migrations/*.sql 建立/升级 schema（幂等）
 * - 提取 pg_dump 输出中的纯 INSERT 语句（跳过 \restrict / SET / 注释）
 * - 修正 jina 组 category=embedding
 *
 * 用法：cd apps/gateway && bun run ./pglite-import.ts
 */
import fs from 'node:fs'
import path from 'node:path'

import { PGlite } from '@electric-sql/pglite'

const DATA_DIR = path.resolve(process.cwd(), '.pglite')
const MIGRATIONS_DIR = path.resolve(process.cwd(), '../../packages/db/migrations')
const DUMP_PATH = process.env.DUMP_PATH ?? '/tmp/prod_config.sql'
const JINA_GROUP_ID = 'f92e2661-564f-4f27-811f-961e4617b5f2'

function extractInserts(sql: string): string[] {
  const statements: string[] = []
  let buf = ''
  let inInsert = false
  for (const line of sql.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.startsWith('INSERT INTO public.')) {
      inInsert = true
      buf = line
      if (line.trimEnd().endsWith(';')) {
        statements.push(line)
        buf = ''
        inInsert = false
      }
      continue
    }
    if (inInsert) {
      buf += '\n' + line
      if (line.trimEnd().endsWith(';')) {
        statements.push(buf)
        buf = ''
        inInsert = false
      }
    }
  }
  return statements.filter((s) => s.includes(';'))
}

async function runMigrations(db: PGlite) {
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .toSorted()
  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8')
    try {
      await db.exec(sql)
      console.log(`[migrate] ${f}`)
    } catch (e) {
      console.log(`[migrate] ${f} skipped: ${(e as Error).message.slice(0, 80)}`)
    }
  }
}

async function main() {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const db = new PGlite(DATA_DIR)

  // 1. 迁移建 schema
  await runMigrations(db)

  const raw = fs.readFileSync(DUMP_PATH, 'utf8')
  const inserts = extractInserts(raw)
  console.log(`[import] extracted ${inserts.length} INSERT statements`)

  // 2. 按外键逆序清空（新库通常为空，防御性执行）
  const tables = [
    'model_group_memberships',
    'model_instances',
    'model_groups',
    'route_rules',
    'access_models',
    'virtual_keys',
    'gateway_configs',
    'providers',
  ]
  for (const t of tables) {
    try {
      await db.exec(`DELETE FROM ${t}`)
    } catch {
      /* skip */
    }
  }

  // 3. 执行 INSERT
  for (const stmt of inserts) {
    try {
      await db.exec(stmt)
    } catch (e) {
      console.warn(`[import] stmt failed (${(e as Error).message.slice(0, 80)}), skipping`)
    }
  }
  console.log('[import] INSERTs done')

  // 4. 修正 jina category
  await db.exec(`UPDATE model_groups SET category='embedding' WHERE id='${JINA_GROUP_ID}'`)

  // 5. 验证
  const providers = await db.query('SELECT name, enabled FROM providers ORDER BY name')
  const jinaGroups = await db.query(
    "SELECT name, category FROM model_groups WHERE name LIKE '%jina%'",
  )
  const jinaInstances = await db.query(
    "SELECT name, actual_model_name FROM model_instances WHERE name LIKE '%jina%'",
  )
  const jinaAccess = await db.query(
    "SELECT name, enabled FROM access_models WHERE name LIKE '%jina%'",
  )

  console.log('[import] providers:', providers.rows.map((r: { name: string }) => r.name).join(', '))
  console.log('[import] jina groups:', JSON.stringify(jinaGroups.rows))
  console.log('[import] jina instances:', JSON.stringify(jinaInstances.rows))
  console.log('[import] jina access_models:', JSON.stringify(jinaAccess.rows))

  await db.close()
  console.log('[import] done')
}

main().catch((e) => {
  console.error('[import] FAILED:', e)
  process.exit(1)
})
