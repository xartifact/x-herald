#!/usr/bin/env bun
/**
 * Export a training corpus from the request logs.
 *
 * The corpus is produced on demand, never stored: `request_logs` already holds
 * every original message, so keeping a derived copy in the database would be the
 * duplication the storage plan exists to remove. Re-run this whenever the
 * training need changes.
 *
 * What it does, per docs/log-storage-optimization-plan.md Phase 3:
 *   1. reads `request_logs` (optionally narrowed to a conversation or a date range)
 *   2. keeps only requests that succeeded and carry a response
 *   3. strips agent noise with the same `stripNoiseBlocks` the router uses
 *   4. redacts IPs and token-shaped strings
 *   5. drops duplicate conversations by content fingerprint (retries / replays)
 *   6. writes JSONL — one conversation per line, each with `source_log_id`
 *
 * Usage:
 *   cd apps/gateway && bun run --env-file=../../.env.local --env-file=../../.env \
 *     scripts/export-corpus.ts [--out corpus.jsonl] [--conversation <id>] \
 *     [--since 2026-01-01] [--until 2026-03-01] [--limit 5000] [--dry-run]
 *
 * Output: the JSONL file (or stdout with `--out -`), plus a summary on stderr
 * counting what was exported and why anything was skipped.
 */
import { writeFileSync } from 'node:fs'
import { and, asc, desc, eq, gte, isNotNull, lte } from '@xartifact/x-herald-db'
import { createDbConnection, getDatabase, requestLogs } from '@xartifact/x-herald-db'
import * as schema from '@xartifact/x-herald-db'

import logger from '../src/lib/logger'
import {
  buildCorpus,
  toJsonl,
  type RequestLogRow,
} from '../src/features/logs/services/corpus-export'

interface Args {
  out: string
  conversation?: string
  since?: string
  until?: string
  limit: number
  dryRun: boolean
}

/** Parse argv into the exporter's option set. */
function parseArgs(argv: readonly string[]): Args {
  const args: Args = { out: 'corpus.jsonl', limit: 10_000, dryRun: false }
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i]
    const value = argv[i + 1]
    switch (flag) {
      case '--out':
        if (value === undefined) throw new Error('export-corpus: --out needs a value')
        args.out = value
        i += 1
        break
      case '--conversation':
        if (value === undefined) throw new Error('export-corpus: --conversation needs a value')
        args.conversation = value
        i += 1
        break
      case '--since':
        if (value === undefined) throw new Error('export-corpus: --since needs a value')
        args.since = value
        i += 1
        break
      case '--until':
        if (value === undefined) throw new Error('export-corpus: --until needs a value')
        args.until = value
        i += 1
        break
      case '--limit':
        if (value === undefined) throw new Error('export-corpus: --limit needs a value')
        args.limit = Number.parseInt(value, 10)
        i += 1
        break
      case '--dry-run':
        args.dryRun = true
        break
      default:
        throw new Error(`export-corpus: unknown option ${String(flag)}`)
    }
  }
  return args
}

const args = parseArgs(process.argv.slice(2))

// Only successful requests carry a usable reply; a failure log has a prompt but
// no answer to learn from.
const conditions = [eq(requestLogs.status, 'success'), isNotNull(requestLogs.responseBody)]
if (args.conversation) conditions.push(eq(requestLogs.conversationId, args.conversation))
if (args.since) conditions.push(gte(requestLogs.createdAt, new Date(args.since)))
if (args.until) conditions.push(lte(requestLogs.createdAt, new Date(args.until)))

// Connect through `createDbConnection` rather than the gateway's `createDatabase`
// wrapper: the wrapper hardcodes `migrateOnBoot`, which would run migrations
// against whatever database this read-only export points at. An exporter must
// never mutate the database it reads.
await createDbConnection(
  {
    type: 'postgres',
    host: process.env.DB_HOST ?? 'localhost',
    port: Number.parseInt(process.env.DB_PORT ?? '5432', 10),
    database: process.env.DB_NAME ?? 'llm_gateway',
    user: process.env.DB_USER ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    ssl: process.env.DB_SSL === 'true',
    migrateOnBoot: false,
  },
  logger,
  schema,
)

const db = getDatabase()
// Oldest first: the first occurrence of a duplicated conversation is the one
// whose provenance (earliest timestamp) is most useful to keep.
const rows = await db
  .select({
    id: requestLogs.id,
    conversationId: requestLogs.conversationId,
    modelName: requestLogs.modelName,
    createdAt: requestLogs.createdAt,
    requestBody: requestLogs.requestBody,
  })
  .from(requestLogs)
  .where(and(...conditions))
  .orderBy(asc(requestLogs.createdAt), desc(requestLogs.id))
  .limit(args.limit)

const { samples, skipped } = buildCorpus(rows as RequestLogRow[])
const jsonl = toJsonl(samples)

console.error('export-corpus: scanned %d log row(s)', rows.length)
console.error(
  'export-corpus: exported %d conversation(s); skipped %d empty, %d duplicate',
  samples.length,
  skipped.empty,
  skipped.duplicate,
)

if (args.dryRun) {
  console.error('export-corpus: --dry-run, nothing written')
} else if (args.out === '-') {
  process.stdout.write(jsonl)
} else {
  writeFileSync(args.out, jsonl, 'utf-8')
  console.error('export-corpus: wrote %s (%d bytes)', args.out, Buffer.byteLength(jsonl))
}
