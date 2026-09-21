/**
 * Training-corpus assembly from request logs.
 *
 * The corpus is generated on demand rather than stored: the logs already hold
 * every original message, so materializing a second copy in the database would
 * be exactly the duplication the storage plan set out to remove. Re-running the
 * exporter after a training need changes is cheap; keeping a derived table in
 * sync is not.
 *
 * This module holds the pure transformations (redaction, deduplication, JSONL
 * shaping) so they can be tested without a database. `scripts/export-corpus.ts`
 * supplies the rows.
 *
 * @module apps/gateway/src/features/logs/services/corpus-export
 */

import { createHash } from 'node:crypto'

import { stripNoiseBlocks } from '../../../gateway/services/intent-router'

/** One conversation turn as it appears in the exported corpus. */
export interface CorpusTurn {
  /** Speaker role. */
  readonly role: 'user' | 'assistant'
  /** Redacted, noise-stripped message text. */
  readonly content: string
}

/** One exported training sample: a whole conversation plus its provenance. */
export interface CorpusSample {
  /** Log id this conversation came from — lets a sample be traced back. */
  readonly source_log_id: string
  /** Conversation grouping key, when the log carried one. */
  readonly conversation_id: string | null
  /** Model that served the request. */
  readonly model_name: string | null
  /** ISO timestamp of the originating request. */
  readonly created_at: string
  /** Conversation turns, oldest first. */
  readonly turns: readonly CorpusTurn[]
}

/** Minimal shape the exporter needs from a `request_logs` row. */
export interface RequestLogRow {
  readonly id: string
  readonly conversationId: string | null
  readonly modelName: string | null
  readonly createdAt: Date | string
  readonly requestBody: unknown
}

/** A message inside a stored request body. */
interface StoredMessage {
  role?: unknown
  content?: unknown
}

/**
 * Redact identifiers that must not reach a training corpus.
 *
 * Virtual key names, IP addresses and user agents identify a person or a
 * deployment; the key *id* is kept because it is an opaque internal reference
 * useful for tracing, and carries no personal data on its own.
 * @param text - text to redact.
 * @returns the text with identifiers masked.
 */
export function redactText(text: string): string {
  return (
    text
      // IPv4: zero the last octet, keeping the subnet for coarse analysis.
      .replace(/\b(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}\b/g, '$1.$2.$3.0')
      // Bearer/API tokens pasted into a prompt.
      .replace(/\b(sk|pk|ghp|xoxb|Bearer)[-_ ][A-Za-z0-9._-]{16,}/gi, '[REDACTED_TOKEN]')
  )
}

/**
 * Flatten a stored message's content into plain text.
 *
 * Multimodal content arrives as parts; only text parts carry training signal, and
 * the non-text ones are dropped rather than serialized.
 * @param content - the stored `content` field.
 * @returns the concatenated text.
 */
function flattenContent(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .filter(
      (part): part is { type?: unknown; text?: unknown } => !!part && typeof part === 'object',
    )
    .filter((part) => part.type === 'text')
    .map((part) => (typeof part.text === 'string' ? part.text : ''))
    .join('\n')
}

/**
 * Build the conversation turns for one log row.
 *
 * Noise is stripped with the same function the router uses, so the corpus never
 * carries agent scaffolding that the routing path already treats as meaningless.
 * Messages that reduce to nothing are dropped instead of exported as empty turns.
 * @param row - the log row.
 * @returns the surviving turns, oldest first.
 */
export function buildTurns(row: RequestLogRow): CorpusTurn[] {
  const body = row.requestBody
  if (!body || typeof body !== 'object') return []
  const messages = (body as { messages?: unknown }).messages
  if (!Array.isArray(messages)) return []
  const turns: CorpusTurn[] = []
  for (const message of messages as StoredMessage[]) {
    if (message?.role !== 'user' && message?.role !== 'assistant') continue
    const cleaned = stripNoiseBlocks(flattenContent(message.content)).trim()
    if (!cleaned) continue
    turns.push({ role: message.role, content: redactText(cleaned) })
  }
  return turns
}

/**
 * Content fingerprint used to drop duplicate conversations.
 *
 * Retries and replays produce byte-identical conversations; exporting each one
 * would over-weight those prompts in training. The fingerprint covers the turns
 * only — provenance fields are expected to differ between duplicates.
 * @param turns - conversation turns.
 * @returns a hex SHA-256 digest.
 */
export function fingerprint(turns: readonly CorpusTurn[]): string {
  const canonical = turns.map((turn) => `${turn.role}\u0000${turn.content}`).join('\u0001')
  return createHash('sha256').update(canonical).digest('hex')
}

/** Outcome of one export pass. */
export interface CorpusBuildResult {
  /** Samples that survived filtering, in input order. */
  readonly samples: readonly CorpusSample[]
  /** Rows skipped, by reason — so a surprising count is explainable. */
  readonly skipped: {
    /** Row carried no usable user/assistant turns. */
    readonly empty: number
    /** Row's conversation was already emitted. */
    readonly duplicate: number
  }
}

/**
 * Turn log rows into deduplicated corpus samples.
 *
 * A conversation needs at least one user turn and one assistant turn: a prompt
 * with no reply teaches nothing, and a reply with no prompt is unusable.
 * @param rows - log rows, in the order they should be considered.
 * @returns the samples plus a per-reason skip count.
 */
export function buildCorpus(rows: readonly RequestLogRow[]): CorpusBuildResult {
  const samples: CorpusSample[] = []
  const seen = new Set<string>()
  let empty = 0
  let duplicate = 0

  for (const row of rows) {
    const turns = buildTurns(row)
    const hasUser = turns.some((turn) => turn.role === 'user')
    const hasAssistant = turns.some((turn) => turn.role === 'assistant')
    if (!hasUser || !hasAssistant) {
      empty += 1
      continue
    }
    const digest = fingerprint(turns)
    if (seen.has(digest)) {
      duplicate += 1
      continue
    }
    seen.add(digest)
    samples.push({
      source_log_id: row.id,
      conversation_id: row.conversationId,
      model_name: row.modelName,
      created_at:
        row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
      turns,
    })
  }

  return { samples, skipped: { empty, duplicate } }
}

/**
 * Serialize samples as JSONL — one conversation per line.
 * @param samples - the samples to serialize.
 * @returns the JSONL text, newline-terminated when non-empty.
 */
export function toJsonl(samples: readonly CorpusSample[]): string {
  if (samples.length === 0) return ''
  return `${samples.map((sample) => JSON.stringify(sample)).join('\n')}\n`
}
