/**
 * Intent decision recorder + query service
 *
 * Persists per-request intent classification decisions for auditing and analytics.
 * Insert path is fire-and-forget — failures are logged, never re-thrown to the caller.
 */

import { and, desc, eq, gte, lte, sql } from '@xartifact/x-herald-db'

import { getDatabase } from '../../../db/client'
import rootLogger from '../../../lib/logger'
import { intentLogs, modelGroups, virtualKeys, type IntentSource } from '@xartifact/x-herald-db'
import type { NewIntentLog } from '@xartifact/x-herald-db'

const logger = rootLogger.child({ module: 'intent-log-service' })

const INSERT_TIMEOUT_MS = 3_000

export interface RecordIntentDecisionInput {
  requestGroupId?: string
  virtualKeyId?: string
  accessModelId?: string
  accessModelName?: string
  modelRouteId?: string
  modelRouteName?: string
  modelRoutePriority?: number
  intentName: string
  intentSource: IntentSource
  intentConfidence?: number | null
  /** 分类器实际返回的 category 字符串（与 intentName 解耦） */
  classifierCategory?: string | null
  targetGroupId?: string | null
  classifierLatencyMs?: number | null
  classifierRawResponse?: string | null
  classifierProviderId?: string | null
  classifierProviderName?: string | null
  classifierModelName?: string | null
  classifierPromptVersion?: number | null
  userMessageRaw?: string | null
  userMessage?: string | null
  userMessageCapabilities?: string[] | null
  classifierSystemPrompt?: string | null
  classifierReasoning?: string | null
  classifierRequestMessages?: unknown[] | null
  classifierRequestBody?: unknown | null
  classifierResponseBody?: unknown | null
  classifierStatusCode?: number | null
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<never>((_, rej) =>
      setTimeout(() => rej(new Error(`DB operation timed out after ${ms}ms`)), ms),
    ),
  ])
}

async function enrichTargetGroupName(groupId: string | null | undefined): Promise<string | null> {
  if (!groupId) return null
  try {
    const db = getDatabase()
    const result = await db
      .select({ name: modelGroups.name })
      .from(modelGroups)
      .where(eq(modelGroups.id, groupId))
      .limit(1)
    return result[0]?.name ?? null
  } catch {
    return null
  }
}

async function enrichVirtualKeyName(keyId: string | undefined): Promise<string | null> {
  if (!keyId) return null
  try {
    const db = getDatabase()
    const result = await db
      .select({ name: virtualKeys.name })
      .from(virtualKeys)
      .where(eq(virtualKeys.id, keyId))
      .limit(1)
    return result[0]?.name ?? null
  } catch {
    return null
  }
}

export function recordIntentDecision(input: RecordIntentDecisionInput): void {
  void (async () => {
    try {
      const [virtualKeyName, targetGroupName] = await Promise.all([
        enrichVirtualKeyName(input.virtualKeyId),
        enrichTargetGroupName(input.targetGroupId),
      ])

      const row: NewIntentLog = {
        requestGroupId: input.requestGroupId ?? null,
        virtualKeyId: input.virtualKeyId ?? null,
        virtualKeyName,
        accessModelId: input.accessModelId ?? null,
        accessModelName: input.accessModelName ?? null,
        modelRouteId: input.modelRouteId ?? null,
        modelRouteName: input.modelRouteName ?? null,
        modelRoutePriority: input.modelRoutePriority ?? null,
        intentName: input.intentName,
        intentSource: input.intentSource,
        intentConfidence: input.intentConfidence ?? null,
        classifierCategory: input.classifierCategory ?? null,
        targetGroupId: input.targetGroupId ?? null,
        targetGroupName,
        classifierProviderId: input.classifierProviderId ?? null,
        classifierProviderName: input.classifierProviderName ?? null,
        classifierModelName: input.classifierModelName ?? null,
        classifierLatencyMs: input.classifierLatencyMs ?? null,
        classifierRawResponse: input.classifierRawResponse ?? null,
        classifierPromptVersion: input.classifierPromptVersion ?? null,
        userMessageRaw: input.userMessageRaw ?? null,
        userMessage: input.userMessage ?? null,
        userMessageCapabilities: input.userMessageCapabilities ?? [],
        classifierSystemPrompt: input.classifierSystemPrompt ?? null,
        classifierReasoning: input.classifierReasoning ?? null,
        classifierRequestMessages: input.classifierRequestMessages ?? null,
        classifierRequestBody: input.classifierRequestBody ?? null,
        classifierResponseBody: input.classifierResponseBody ?? null,
        classifierStatusCode: input.classifierStatusCode ?? null,
      }

      const db = getDatabase()
      await withTimeout(db.insert(intentLogs).values(row), INSERT_TIMEOUT_MS)
    } catch (error) {
      logger.warn(
        { err: error, input: { ...input, classifierRawResponse: '[truncated]' } },
        'Failed to record intent decision',
      )
    }
  })()
}

// ─── Query ──────────────────────────────────────────────────────────────────

export interface IntentLogsPageParams {
  cursor?: string
  pageSize: number
  virtualKeyId?: string
  accessModelId?: string
  intentName?: string
  intentSource?: IntentSource
  startDate?: string
  endDate?: string
}

export interface IntentLogRow {
  id: string
  requestGroupId: string | null
  virtualKeyId: string | null
  virtualKeyName: string | null
  accessModelId: string | null
  accessModelName: string | null
  modelRouteId: string | null
  modelRouteName: string | null
  modelRoutePriority: number | null
  intentName: string
  intentSource: IntentSource
  intentConfidence: number | null
  classifierCategory: string | null
  targetGroupId: string | null
  targetGroupName: string | null
  classifierProviderId: string | null
  classifierProviderName: string | null
  classifierModelName: string | null
  classifierLatencyMs: number | null
  classifierRawResponse: string | null
  classifierPromptVersion: number | null
  userMessageRaw: string | null
  userMessage: string | null
  userMessageCapabilities: string[] | null
  classifierSystemPrompt: string | null
  classifierReasoning: string | null
  classifierRequestMessages: unknown[] | null
  classifierRequestBody: unknown | null
  classifierResponseBody: unknown | null
  classifierStatusCode: number | null
  createdAt: string
}

export interface IntentLogsPage {
  logs: IntentLogRow[]
  nextCursor: string | null
  hasMore: boolean
}

interface CursorPayload {
  createdAt: string
  id: string
}

function encodeCursor(payload: CursorPayload): string {
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
}

function decodeCursor(cursor: string): CursorPayload | null {
  try {
    const json = Buffer.from(cursor, 'base64url').toString('utf8')
    const parsed = JSON.parse(json) as CursorPayload
    if (typeof parsed.createdAt === 'string' && typeof parsed.id === 'string') {
      return parsed
    }
  } catch {
    /* fall through */
  }
  return null
}

function buildFilterConditions(params: IntentLogsPageParams) {
  const conditions = []
  if (params.virtualKeyId) conditions.push(eq(intentLogs.virtualKeyId, params.virtualKeyId))
  if (params.accessModelId) conditions.push(eq(intentLogs.accessModelId, params.accessModelId))
  if (params.intentName) conditions.push(eq(intentLogs.intentName, params.intentName))
  if (params.intentSource) conditions.push(eq(intentLogs.intentSource, params.intentSource))
  if (params.startDate) conditions.push(gte(intentLogs.createdAt, new Date(params.startDate)))
  if (params.endDate) conditions.push(lte(intentLogs.createdAt, new Date(params.endDate)))
  return conditions.length > 0 ? and(...conditions) : undefined
}

export async function getIntentLogsPage(params: IntentLogsPageParams): Promise<IntentLogsPage> {
  const db = getDatabase()
  const pageSize = Math.min(Math.max(params.pageSize, 1), 200)

  const conditions = buildFilterConditions(params)
  let query = db.select().from(intentLogs).$dynamic()

  if (params.cursor) {
    const cursor = decodeCursor(params.cursor)
    if (cursor) {
      const cursorDate = new Date(cursor.createdAt)
      const cursorCondition = sql`(${intentLogs.createdAt} < ${cursorDate}) OR (${intentLogs.createdAt} = ${cursorDate} AND ${intentLogs.id} < ${cursor.id})`
      query = query.where(conditions ? and(conditions, cursorCondition) : cursorCondition)
    }
  } else if (conditions) {
    query = query.where(conditions)
  }

  const rows = await query
    .orderBy(desc(intentLogs.createdAt), desc(intentLogs.id))
    .limit(pageSize + 1)
  const hasMore = rows.length > pageSize
  const trimmed = rows.slice(0, pageSize)

  const logs: IntentLogRow[] = trimmed.map((r) => ({
    id: r.id,
    requestGroupId: r.requestGroupId,
    virtualKeyId: r.virtualKeyId,
    virtualKeyName: r.virtualKeyName,
    accessModelId: r.accessModelId,
    accessModelName: r.accessModelName,
    modelRouteId: r.modelRouteId,
    modelRouteName: r.modelRouteName,
    modelRoutePriority: r.modelRoutePriority,
    intentName: r.intentName,
    intentSource: r.intentSource,
    intentConfidence: r.intentConfidence,
    classifierCategory: r.classifierCategory,
    targetGroupId: r.targetGroupId,
    targetGroupName: r.targetGroupName,
    classifierProviderId: r.classifierProviderId,
    classifierProviderName: r.classifierProviderName,
    classifierModelName: r.classifierModelName,
    classifierLatencyMs: r.classifierLatencyMs,
    classifierRawResponse: r.classifierRawResponse,
    classifierPromptVersion: r.classifierPromptVersion,
    userMessageRaw: r.userMessageRaw,
    userMessage: r.userMessage,
    userMessageCapabilities: (r.userMessageCapabilities as string[] | null) ?? [],
    classifierSystemPrompt: r.classifierSystemPrompt,
    classifierReasoning: r.classifierReasoning,
    classifierRequestMessages: r.classifierRequestMessages as unknown[] | null,
    classifierRequestBody: r.classifierRequestBody as unknown | null,
    classifierResponseBody: r.classifierResponseBody as unknown | null,
    classifierStatusCode: r.classifierStatusCode,
    createdAt: r.createdAt.toISOString(),
  }))

  const last = trimmed[trimmed.length - 1]
  const nextCursor =
    hasMore && last ? encodeCursor({ createdAt: last.createdAt.toISOString(), id: last.id }) : null

  return { logs, nextCursor, hasMore }
}

export interface IntentStats {
  total: number
  byIntentName: Array<{ intentName: string; count: number }>
  byIntentSource: Array<{ intentSource: IntentSource; count: number }>
  byAccessModel: Array<{
    accessModelId: string | null
    accessModelName: string | null
    count: number
  }>
  avgClassifierLatencyMs: number | null
}

export async function getIntentStats(params: {
  startDate?: string
  endDate?: string
  virtualKeyId?: string
}): Promise<IntentStats> {
  const db = getDatabase()

  const conditions = []
  if (params.startDate) conditions.push(gte(intentLogs.createdAt, new Date(params.startDate)))
  if (params.endDate) conditions.push(lte(intentLogs.createdAt, new Date(params.endDate)))
  if (params.virtualKeyId) conditions.push(eq(intentLogs.virtualKeyId, params.virtualKeyId))
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [totalRow, intentNameRows, sourceRows, accessModelRows, latencyRow] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(intentLogs)
      .where(where),
    db
      .select({
        intentName: intentLogs.intentName,
        count: sql<number>`count(*)::int`,
      })
      .from(intentLogs)
      .where(where)
      .groupBy(intentLogs.intentName)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        intentSource: intentLogs.intentSource,
        count: sql<number>`count(*)::int`,
      })
      .from(intentLogs)
      .where(where)
      .groupBy(intentLogs.intentSource)
      .orderBy(sql`count(*) desc`),
    db
      .select({
        accessModelId: intentLogs.accessModelId,
        accessModelName: intentLogs.accessModelName,
        count: sql<number>`count(*)::int`,
      })
      .from(intentLogs)
      .where(where)
      .groupBy(intentLogs.accessModelId, intentLogs.accessModelName)
      .orderBy(sql`count(*) desc`)
      .limit(50),
    db
      .select({
        avg: sql<number | null>`AVG(${intentLogs.classifierLatencyMs})::float`,
      })
      .from(intentLogs)
      .where(
        where
          ? and(where, sql`${intentLogs.classifierLatencyMs} IS NOT NULL`)
          : sql`${intentLogs.classifierLatencyMs} IS NOT NULL`,
      ),
  ])

  return {
    total: totalRow[0]?.count ?? 0,
    byIntentName: intentNameRows.map((r) => ({ intentName: r.intentName, count: r.count })),
    byIntentSource: sourceRows.map((r) => ({ intentSource: r.intentSource, count: r.count })),
    byAccessModel: accessModelRows.map((r) => ({
      accessModelId: r.accessModelId,
      accessModelName: r.accessModelName,
      count: r.count,
    })),
    avgClassifierLatencyMs: latencyRow[0]?.avg ?? null,
  }
}
