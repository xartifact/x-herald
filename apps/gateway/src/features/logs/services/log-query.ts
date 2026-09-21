import {
  and,
  asc,
  desc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from '@xartifact/x-herald-db'

import { getDatabase } from '../../../db/client'
import { virtualKeys } from '@xartifact/x-herald-db'

import { requestLogs, requestAttempts } from '@xartifact/x-herald-db'
import { resolveTimezone, startOfDayInTimezone } from '../../../gateway/lib/timezone'

import type { LogMetadata } from '../db'

interface DateRange {
  startDate?: string
  endDate?: string
}

interface LogsPageParams extends DateRange {
  cursor?: string // base64-encoded { createdAt: ISO, id: string }
  pageSize: number
  virtualKeyId?: string
  modelName?: string
  status?: string
  requestCategory?: 'embedding' | 'chat_text' | 'chat_image' | 'chat_video' | 'chat_audio' | 'other'
  clientType?: string
}

const LIST_SELECT = {
  id: requestLogs.id,
  status: requestLogs.status,
  statusCode: requestLogs.statusCode,
  modelName: requestLogs.modelName,
  originalModelName: requestLogs.originalModelName,
  providerId: requestLogs.providerId,
  providerName: requestLogs.providerName,
  virtualKeyId: requestLogs.virtualKeyId,
  virtualKeyName: requestLogs.virtualKeyName,
  responseTimeMs: requestLogs.responseTimeMs,
  inputTokens: requestLogs.inputTokens,
  outputTokens: requestLogs.outputTokens,
  totalTokens: requestLogs.totalTokens,
  streaming: requestLogs.streaming,
  errorMessage: requestLogs.errorMessage,
  errorType: requestLogs.errorType,
  clientType: requestLogs.clientType,
  requestPath: requestLogs.requestPath,
  requestCategory: requestLogs.requestCategory,
  createdAt: requestLogs.createdAt,
  isComplete: requestLogs.isComplete,
  thinkingMode: sql<
    boolean | null
  >`((${requestLogs.metadata}->'request'->>'thinkingMode')::boolean)`,
  thinking: sql<NonNullable<LogMetadata['request']>['thinking'] | null>`(
    ${requestLogs.metadata}->'request'->'thinking'
  )`,
  responseModelName: sql<string | null>`(${requestLogs.metadata}->'routing'->>'responseModelName')`,
}

function buildDateConditions(range: DateRange) {
  const conds = []
  if (range.startDate) conds.push(gte(requestLogs.createdAt, new Date(range.startDate)))
  if (range.endDate) conds.push(lte(requestLogs.createdAt, new Date(range.endDate)))
  return conds
}

export async function getLogsPage(params: LogsPageParams) {
  const db = getDatabase()
  const { cursor, pageSize, virtualKeyId, modelName, status, clientType, requestCategory } = params
  const conditions = [...buildDateConditions(params)]

  if (virtualKeyId) conditions.push(eq(requestLogs.virtualKeyId, virtualKeyId))
  if (modelName) conditions.push(eq(requestLogs.modelName, modelName))
  if (status) {
    conditions.push(
      eq(requestLogs.status, status as 'success' | 'failure' | 'cancelled' | 'pending'),
    )
  } else {
    conditions.push(ne(requestLogs.status, 'pending'))
  }
  if (requestCategory) conditions.push(eq(requestLogs.requestCategory, requestCategory))
  if (clientType) conditions.push(eq(requestLogs.clientType, clientType))

  if (cursor) {
    try {
      const { createdAt, id } = JSON.parse(Buffer.from(cursor, 'base64').toString()) as {
        createdAt: string
        id: string
      }
      conditions.push(
        or(
          lt(requestLogs.createdAt, new Date(createdAt)),
          and(eq(requestLogs.createdAt, new Date(createdAt)), lt(requestLogs.id, id))!,
        )!,
      )
    } catch {
      /* invalid cursor, ignore */
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const rows = await db
    .select(LIST_SELECT)
    .from(requestLogs)
    .where(where)
    .orderBy(desc(requestLogs.createdAt), desc(requestLogs.id))
    .limit(pageSize + 1)

  const hasMore = rows.length > pageSize
  const logs = hasMore ? rows.slice(0, pageSize) : rows

  let nextCursor: string | null = null
  if (hasMore && logs.length > 0) {
    const last = logs[logs.length - 1]
    nextCursor = Buffer.from(
      JSON.stringify({
        createdAt: last.createdAt.toISOString(),
        id: last.id,
      }),
    ).toString('base64')
  }

  return { logs, nextCursor, hasMore }
}

export async function getLogDetail(id: string) {
  const db = getDatabase()
  const log = await db.select().from(requestLogs).where(eq(requestLogs.id, id)).limit(1)
  if (!log[0]) return null
  const attempts = await db
    .select({
      transformedRequestBody: requestAttempts.transformedRequestBody,
      providerRequestHeaders: requestAttempts.providerRequestHeaders,
      providerResponseBody: requestAttempts.providerResponseBody,
      providerResponseHeaders: requestAttempts.providerResponseHeaders,
    })
    .from(requestAttempts)
    .where(
      and(
        eq(requestAttempts.requestLogId, id),
        eq(requestAttempts.candidateIndex, log[0].candidateIndex),
      ),
    )
    .limit(1)
  const attempt = attempts[0]
  return {
    ...log[0],
    transformedRequestBody: attempt?.transformedRequestBody ?? null,
    providerRequestHeaders: attempt?.providerRequestHeaders ?? null,
    providerResponseBody: attempt?.providerResponseBody ?? null,
    providerResponseHeaders: attempt?.providerResponseHeaders ?? null,
  }
}

export async function deleteLog(id: string): Promise<boolean> {
  const db = getDatabase()
  const existing = await db
    .select({ id: requestLogs.id })
    .from(requestLogs)
    .where(eq(requestLogs.id, id))
    .limit(1)
  if (existing.length === 0) return false
  await db.delete(requestLogs).where(eq(requestLogs.id, id))
  return true
}

export async function getOverviewStats(range: DateRange) {
  const db = getDatabase()
  const conditions = buildDateConditions(range)
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const OVERVIEW_SELECT = {
    totalRequests: sql<number>`count(*)`,
    successRequests: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
    failureRequests: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
    cancelledRequests: sql<number>`count(*) filter (where ${requestLogs.status} = 'cancelled')`,
    avgResponseTime: sql<number>`avg(${requestLogs.responseTimeMs})`,
    totalInputTokens: sql<number>`sum(${requestLogs.inputTokens})`,
    totalOutputTokens: sql<number>`sum(${requestLogs.outputTokens})`,
    totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
  }

  const [overview, modelStats, keyStats, clientStats] = await Promise.all([
    db.select(OVERVIEW_SELECT).from(requestLogs).where(where),
    db
      .select({
        modelName: requestLogs.modelName,
        requestCount: sql<number>`count(*)`,
        avgResponseTime: sql<number>`avg(${requestLogs.responseTimeMs})`,
        totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
      })
      .from(requestLogs)
      .where(where)
      .groupBy(requestLogs.modelName),
    db
      .select({
        virtualKeyId: requestLogs.virtualKeyId,
        virtualKeyName: requestLogs.virtualKeyName,
        requestCount: sql<number>`count(*)`,
        totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
      })
      .from(requestLogs)
      .where(
        conditions.length > 0
          ? and(...conditions, isNotNull(requestLogs.virtualKeyId))
          : isNotNull(requestLogs.virtualKeyId),
      )
      .groupBy(requestLogs.virtualKeyId, requestLogs.virtualKeyName),
    db
      .select({
        clientType: requestLogs.clientType,
        requestCount: sql<number>`count(*)`,
      })
      .from(requestLogs)
      .where(where)
      .groupBy(requestLogs.clientType)
      .orderBy(desc(sql`count(*)`))
      .limit(10),
  ])

  return {
    overview: {
      totalRequests: Number(overview[0]?.totalRequests ?? 0),
      successRequests: Number(overview[0]?.successRequests ?? 0),
      failureRequests: Number(overview[0]?.failureRequests ?? 0),
      cancelledRequests: Number(overview[0]?.cancelledRequests ?? 0),
      avgResponseTime: Number(overview[0]?.avgResponseTime ?? 0),
      totalInputTokens: Number(overview[0]?.totalInputTokens ?? 0),
      totalOutputTokens: Number(overview[0]?.totalOutputTokens ?? 0),
      totalTokens: Number(overview[0]?.totalTokens ?? 0),
    },
    modelStats: modelStats.map((s) => ({
      modelName: s.modelName,
      requestCount: Number(s.requestCount),
      avgResponseTime: Number(s.avgResponseTime),
      totalTokens: Number(s.totalTokens),
    })),
    keyStats: keyStats.map((s) => ({
      virtualKeyId: s.virtualKeyId ?? '',
      virtualKeyName: s.virtualKeyName ?? '',
      requestCount: Number(s.requestCount),
      totalTokens: Number(s.totalTokens),
    })),
    clientStats: clientStats.map((s) => ({
      clientType: s.clientType,
      requestCount: Number(s.requestCount),
    })),
  }
}

export async function getClientModelStats(range: DateRange) {
  const db = getDatabase()
  const conditions = [isNotNull(requestLogs.originalModelName), ...buildDateConditions(range)]
  const where = and(...conditions)

  const stats = await db
    .select({
      originalModelName: requestLogs.originalModelName,
      requestCount: sql<number>`count(*)`,
      successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
      failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
      totalInputTokens: sql<number>`sum(${requestLogs.inputTokens})`,
      totalOutputTokens: sql<number>`sum(${requestLogs.outputTokens})`,
      totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
      avgResponseTime: sql<number>`avg(${requestLogs.responseTimeMs})`,
      lastRequestAt: sql<Date | null>`max(${requestLogs.createdAt})`,
    })
    .from(requestLogs)
    .where(where)
    .groupBy(requestLogs.originalModelName)

  return stats.map((s) => ({
    originalModelName: s.originalModelName,
    requestCount: Number(s.requestCount),
    successCount: Number(s.successCount),
    failureCount: Number(s.failureCount),
    totalInputTokens: Number(s.totalInputTokens ?? 0),
    totalOutputTokens: Number(s.totalOutputTokens ?? 0),
    totalTokens: Number(s.totalTokens ?? 0),
    avgResponseTime: Number(s.avgResponseTime ?? 0),
    lastRequestAt: s.lastRequestAt?.toISOString() ?? '',
  }))
}

export async function getStorageStats() {
  const db = getDatabase()
  const RETENTION_DAYS = 30
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

  const [countResult, dateRange, expiredCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(requestLogs),
    db
      .select({
        oldest: sql<Date | null>`min(${requestLogs.createdAt})`,
        newest: sql<Date | null>`max(${requestLogs.createdAt})`,
      })
      .from(requestLogs),
    db
      .select({ count: sql<number>`count(*)` })
      .from(requestLogs)
      .where(lt(requestLogs.createdAt, cutoffDate)),
  ])

  return {
    totalCount: Number(countResult[0]?.count ?? 0),
    oldestLogDate: dateRange[0]?.oldest?.toISOString() ?? null,
    newestLogDate: dateRange[0]?.newest?.toISOString() ?? null,
    retentionDays: RETENTION_DAYS,
    cutoffDate: cutoffDate.toISOString(),
    estimatedExpiredLogs: String(expiredCount[0]?.count ?? 0),
  }
}

export async function cleanupLogs(retentionDays: number) {
  const db = getDatabase()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
  const deleted = await db
    .delete(requestLogs)
    .where(lt(requestLogs.createdAt, cutoffDate))
    .returning({ id: requestLogs.id })
  return { deletedCount: deleted.length, retentionDays }
}

/**
 * 密钥用量统计。
 *
 * 设计要点（修复前的三处缺陷）：
 *
 * 1. **单一数据源**：所有 period 都从 `request_logs` 聚合。修复前 `period='all'`
 *    读 `virtual_keys` 的累计列，其余 period 读日志聚合 —— 切标签页等于换一套数据，
 *    且无近期日志的 key 在区间视图里**整行消失**（前端 `stats.get(id)` 得 undefined，
 *    显示成「从未使用」）。
 *
 * 2. **全量 key 保底**：以 `virtual_keys`（软删过滤后）为左表 LEFT JOIN 聚合结果。
 *    本期无请求的 key 仍返回一行、数值为 0，而不是缺席。
 *
 * 3. **`lastUsedAt` 取独立列**：来自 `virtual_keys.last_used_at`（由认证路径无条件
 *    维护），而非 `max(created_at)`。原因：`request_logs` 有留存期清理（默认 30 天），
 *    从日志推导会让「最近使用」在日志被清理后倒退或丢失。
 *
 * 修复前 `all` 分支还把 success/failure/token/avgResponseTime 硬编码为 0，
 * 导致用量面板切到「全部」时成功率恒 0%、平均响应时间恒 `-`。
 */
export async function getKeyStats(period: string, timezone?: string) {
  const db = getDatabase()

  // 时间窗：'all' 不加下限，其余按周期。注意 'all' 仍受日志留存期限制
  // （request_logs 只保留 METRICS_RETENTION_DAYS），所以区间统计对 'all'
  // 表达的是「留存期内全部」；而 lastUsedAt 走独立列，不受此限制。
  const conditions = [isNotNull(requestLogs.virtualKeyId)]
  const now = new Date()
  if (period === 'today') {
    // 「今天」是调用方的今天：`new Date(y, m, d)` 用的是网关进程时区，
    // Asia/Shanghai 的用户在本地 08:00 前会看到前一天（甚至空）的统计。
    conditions.push(
      gte(requestLogs.createdAt, startOfDayInTimezone(resolveTimezone(timezone), now)),
    )
  } else if (period === '7d') {
    conditions.push(gte(requestLogs.createdAt, new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)))
  } else if (period !== 'all') {
    conditions.push(gte(requestLogs.createdAt, new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)))
  }

  // 以聚合结果为准按 virtualKeyId 分组（不再带 virtualKeyName 快照 —— 改名会把
  // 同一 key 拆成两行，前端 Map 后者覆盖前者导致统计错乱）。
  const aggRows = await db
    .select({
      virtualKeyId: requestLogs.virtualKeyId,
      requestCount: sql<number>`count(*)`,
      successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
      failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
      totalInputTokens: sql<number>`coalesce(sum(${requestLogs.inputTokens}), 0)`,
      totalOutputTokens: sql<number>`coalesce(sum(${requestLogs.outputTokens}), 0)`,
      totalTokens: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)`,
      avgResponseTimeMs: sql<number>`coalesce(round(avg(${requestLogs.responseTimeMs})), 0)`,
    })
    .from(requestLogs)
    .where(and(...conditions))
    .groupBy(requestLogs.virtualKeyId)

  const aggByKeyId = new Map(aggRows.map((r) => [r.virtualKeyId, r]))

  // 全量 key 作为骨架：保证所有周期视图都列出全部密钥
  const keys = await db
    .select({
      id: virtualKeys.id,
      name: virtualKeys.name,
      lastUsedAt: virtualKeys.lastUsedAt,
    })
    .from(virtualKeys)
    .where(isNull(virtualKeys.deletedAt))
    .orderBy(desc(virtualKeys.lastUsedAt))

  return keys.map((k) => {
    const agg = aggByKeyId.get(k.id)
    return {
      virtualKeyId: k.id,
      virtualKeyName: k.name,
      requestCount: Number(agg?.requestCount ?? 0),
      successCount: Number(agg?.successCount ?? 0),
      failureCount: Number(agg?.failureCount ?? 0),
      totalInputTokens: Number(agg?.totalInputTokens ?? 0),
      totalOutputTokens: Number(agg?.totalOutputTokens ?? 0),
      totalTokens: Number(agg?.totalTokens ?? 0),
      avgResponseTimeMs: Number(agg?.avgResponseTimeMs ?? 0),
      lastUsedAt: k.lastUsedAt ? k.lastUsedAt.toISOString() : null,
    }
  })
}

export async function getConversationTrace(conversationId: string) {
  const db = getDatabase()
  const logs = await db
    .select({
      id: requestLogs.id,
      createdAt: requestLogs.createdAt,
      status: requestLogs.status,
      modelName: requestLogs.modelName,
      inputTokens: requestLogs.inputTokens,
      outputTokens: requestLogs.outputTokens,
      responseTimeMs: requestLogs.responseTimeMs,
      errorMessage: requestLogs.errorMessage,
    })
    .from(requestLogs)
    .where(eq(requestLogs.conversationId, conversationId))
    .orderBy(asc(requestLogs.createdAt))

  if (logs.length === 0) return []

  const logIds = logs.map((l) => l.id)
  const allAttempts = await db
    .select({
      id: requestAttempts.id,
      requestLogId: requestAttempts.requestLogId,
      candidateIndex: requestAttempts.candidateIndex,
      providerName: requestAttempts.providerName,
      status: requestAttempts.status,
      failoverReason: requestAttempts.failoverReason,
      ttfbMs: requestAttempts.ttfbMs,
      durationMs: requestAttempts.durationMs,
      statusCode: requestAttempts.statusCode,
    })
    .from(requestAttempts)
    .where(inArray(requestAttempts.requestLogId, logIds))
    .orderBy(asc(requestAttempts.candidateIndex))

  const attemptsByLogId = new Map<string, typeof allAttempts>()
  for (const attempt of allAttempts) {
    const list = attemptsByLogId.get(attempt.requestLogId) ?? []
    list.push(attempt)
    attemptsByLogId.set(attempt.requestLogId, list)
  }

  return logs.map((log) => ({
    id: log.id,
    createdAt: log.createdAt.toISOString(),
    status: log.status,
    modelName: log.modelName,
    inputTokens: log.inputTokens,
    outputTokens: log.outputTokens,
    responseTimeMs: log.responseTimeMs,
    errorMessage: log.errorMessage,
    attempts: (attemptsByLogId.get(log.id) ?? []).map((a) => ({
      id: a.id,
      candidateIndex: a.candidateIndex,
      providerName: a.providerName,
      status: a.status,
      failoverReason: a.failoverReason,
      ttfbMs: a.ttfbMs,
      durationMs: a.durationMs,
      statusCode: a.statusCode,
    })),
  }))
}

export async function getProviderStats(range: DateRange) {
  const db = getDatabase()
  const conditions = [isNotNull(requestLogs.providerId), ...buildDateConditions(range)]
  const ttfbExpr = sql`(${requestLogs.metadata}->'performance'->>'providerTtfbMs')::numeric`

  return db
    .select({
      providerId: requestLogs.providerId,
      providerName: requestLogs.providerName,
      totalRequests: sql<number>`count(*)`.mapWith(Number),
      successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`.mapWith(
        Number,
      ),
      failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`.mapWith(
        Number,
      ),
      avgResponseTime: sql<number>`round(avg(${requestLogs.responseTimeMs}))`.mapWith(Number),
      minResponseTime: sql<number>`min(${requestLogs.responseTimeMs})`.mapWith(Number),
      maxResponseTime: sql<number>`max(${requestLogs.responseTimeMs})`.mapWith(Number),
      p95ResponseTime:
        sql<number>`round(percentile_cont(0.95) within group (order by ${requestLogs.responseTimeMs}))`.mapWith(
          Number,
        ),
      avgTtfb: sql<
        number | null
      >`round(avg(${ttfbExpr}) filter (where ${requestLogs.status} = 'success' and ${ttfbExpr} is not null))`.mapWith(
        Number,
      ),
      p95Ttfb: sql<
        number | null
      >`round(percentile_cont(0.95) within group (order by ${ttfbExpr}) filter (where ${requestLogs.status} = 'success' and ${ttfbExpr} is not null))`.mapWith(
        Number,
      ),
      ttfbCount:
        sql<number>`count(*) filter (where ${requestLogs.status} = 'success' and ${ttfbExpr} is not null)`.mapWith(
          Number,
        ),
      lastRequestAt: sql<Date | null>`max(${requestLogs.createdAt})`,
    })
    .from(requestLogs)
    .where(and(...conditions))
    .groupBy(requestLogs.providerId, requestLogs.providerName)
    .orderBy(sql`avg(${requestLogs.responseTimeMs}) asc nulls last`)
}
