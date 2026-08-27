import postgres from 'postgres'

import { MIGRATIONS_FOLDER } from './client'
import { runPostgresMigrations } from './connections/postgres'

import type { DbLogger } from './types'

const connectionString =
  process.env.DATABASE_URL ||
  `postgres://${process.env.DB_USER || 'postgres'}:${process.env.DB_PASSWORD || 'postgres'}@${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || '5432'}/${process.env.DB_NAME || 'llm_gateway'}`

const client = postgres(connectionString, { max: 1 })

// Delegate straight to runPostgresMigrations — the exact function
// boot-time auto-migration uses — so this manual script never diverges
// from what MIGRATE_ON_BOOT=true does.
const consoleLogger: DbLogger = {
  trace: (obj, msg) => console.log(msg ?? '', obj),
  info: (obj, msg) => console.log(msg ?? '', obj),
  warn: (obj, msg) => console.warn(msg ?? '', obj),
  error: (obj, msg) => console.error(msg ?? '', obj),
}

async function main() {
  await runPostgresMigrations(client, MIGRATIONS_FOLDER, consoleLogger)
  console.log('Migrations completed!')
  await client.end()
}

main().catch((error) => {
  console.error('Migration failed:', error)
  process.exit(1)
})
