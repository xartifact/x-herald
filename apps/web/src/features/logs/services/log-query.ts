import { and, desc, eq, gte, isNotNull, lt, lte, ne, sql } from 'drizzle-orm'

import { getDatabase } from '@/core/db/client'

import { requestLogs } from '../db'

interface DateRange {
  startDate?: string
  endDate?: string
}

interface LogsPageParams extends DateRange {
  page: number
  pageSize: number
  virtualKeyId?: string
  modelName?: string
  status?: string
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
  createdAt: requestLogs.createdAt,
  isComplete: requestLogs.isComplete,
  thinkingMode: sql<boolean | null>`((${requestLogs.metadata}->'request'->>'thinkingMode')::boolean)`,
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
  const { page, pageSize, virtualKeyId, modelName, status, clientType } = params
  const offset = (page - 1) * pageSize
  const conditions = [...buildDateConditions(params)]

  if (virtualKeyId) conditions.push(eq(requestLogs.virtualKeyId, virtualKeyId))
  if (modelName) conditions.push(eq(requestLogs.modelName, modelName))
  if (status) {
    conditions.push(eq(requestLogs.status, status as 'success' | 'failure' | 'pending'))
  } else {
    conditions.push(ne(requestLogs.status, 'pending'))
  }
  if (clientType) conditions.push(eq(requestLogs.clientType, clientType))

  const where = conditions.length > 0 ? and(...conditions) : undefined
  const [countResult, logs] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(requestLogs).where(where),
    db.select(LIST_SELECT).from(requestLogs).where(where)
      .orderBy(desc(requestLogs.lastUpdatedAt)).limit(pageSize).offset(offset),
  ])

  const total = Number(countResult[0]?.count ?? 0)
  return { logs, total, totalPages: Math.ceil(total / pageSize) }
}

export async function getLogDetail(id: string) {
  const db = getDatabase()
  const rows = await db.select().from(requestLogs).where(eq(requestLogs.id, id)).limit(1)
  return rows[0] ?? null
}

export async function deleteLog(id: string): Promise<boolean> {
  const db = getDatabase()
  const existing = await db.select({ id: requestLogs.id }).from(requestLogs).where(eq(requestLogs.id, id)).limit(1)
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
    avgResponseTime: sql<number>`avg(${requestLogs.responseTimeMs})`,
    totalInputTokens: sql<number>`sum(${requestLogs.inputTokens})`,
    totalOutputTokens: sql<number>`sum(${requestLogs.outputTokens})`,
    totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
  }

  const [overview, modelStats, keyStats, clientStats] = await Promise.all([
    db.select(OVERVIEW_SELECT).from(requestLogs).where(where),
    db.select({
      modelName: requestLogs.modelName,
      requestCount: sql<number>`count(*)`,
      avgResponseTime: sql<number>`avg(${requestLogs.responseTimeMs})`,
      totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
    }).from(requestLogs).where(where).groupBy(requestLogs.modelName),
    db.select({
      virtualKeyId: requestLogs.virtualKeyId,
      virtualKeyName: requestLogs.virtualKeyName,
      requestCount: sql<number>`count(*)`,
      totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
    }).from(requestLogs).where(conditions.length > 0 ? and(...conditions, isNotNull(requestLogs.virtualKeyId)) : isNotNull(requestLogs.virtualKeyId)).groupBy(requestLogs.virtualKeyId, requestLogs.virtualKeyName),
    db.select({
      clientType: requestLogs.clientType,
      requestCount: sql<number>`count(*)`,
    }).from(requestLogs).where(where).groupBy(requestLogs.clientType).orderBy(desc(sql`count(*)`)).limit(10),
  ])

  return {
    overview: {
      totalRequests: Number(overview[0]?.totalRequests ?? 0),
      successRequests: Number(overview[0]?.successRequests ?? 0),
      failureRequests: Number(overview[0]?.failureRequests ?? 0),
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
    clientStats: clientStats.map((s) => ({ clientType: s.clientType, requestCount: Number(s.requestCount) })),
  }
}

export async function getClientModelStats(range: DateRange) {
  const db = getDatabase()
  const conditions = [isNotNull(requestLogs.originalModelName), ...buildDateConditions(range)]
  const where = and(...conditions)

  const stats = await db.select({
    originalModelName: requestLogs.originalModelName,
    requestCount: sql<number>`count(*)`,
    successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
    failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
    totalInputTokens: sql<number>`sum(${requestLogs.inputTokens})`,
    totalOutputTokens: sql<number>`sum(${requestLogs.outputTokens})`,
    totalTokens: sql<number>`sum(${requestLogs.totalTokens})`,
    avgResponseTime: sql<number>`avg(${requestLogs.responseTimeMs})`,
    lastRequestAt: sql<string>`max(${requestLogs.createdAt})`,
  }).from(requestLogs).where(where).groupBy(requestLogs.originalModelName)

  return stats.map((s) => ({
    originalModelName: s.originalModelName,
    requestCount: Number(s.requestCount),
    successCount: Number(s.successCount),
    failureCount: Number(s.failureCount),
    totalInputTokens: Number(s.totalInputTokens ?? 0),
    totalOutputTokens: Number(s.totalOutputTokens ?? 0),
    totalTokens: Number(s.totalTokens ?? 0),
    avgResponseTime: Number(s.avgResponseTime ?? 0),
    lastRequestAt: s.lastRequestAt,
  }))
}

export async function getStorageStats() {
  const db = getDatabase()
  const RETENTION_DAYS = 30
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS)

  const [countResult, dateRange, expiredCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(requestLogs),
    db.select({
      oldest: sql<string>`min(${requestLogs.createdAt})`,
      newest: sql<string>`max(${requestLogs.createdAt})`,
    }).from(requestLogs),
    db.select({ count: sql<number>`count(*)` }).from(requestLogs).where(lt(requestLogs.createdAt, cutoffDate)),
  ])

  return {
    totalCount: Number(countResult[0]?.count ?? 0),
    oldestLogDate: dateRange[0]?.oldest ?? null,
    newestLogDate: dateRange[0]?.newest ?? null,
    retentionDays: RETENTION_DAYS,
    cutoffDate: cutoffDate.toISOString(),
    estimatedExpiredLogs: String(expiredCount[0]?.count ?? 0),
  }
}

export async function cleanupLogs(retentionDays: number) {
  const db = getDatabase()
  const cutoffDate = new Date()
  cutoffDate.setDate(cutoffDate.getDate() - retentionDays)
  const deleted = await db.delete(requestLogs).where(lt(requestLogs.createdAt, cutoffDate)).returning({ id: requestLogs.id })
  return { deletedCount: deleted.length, retentionDays }
}

export async function getKeyStats(period: string) {
  const db = getDatabase()
  const conditions = [isNotNull(requestLogs.virtualKeyId)]

  if (period !== 'all') {
    const now = new Date()
    let start: Date
    if (period === 'today') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate())
    } else if (period === '7d') {
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    } else {
      start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    }
    conditions.push(gte(requestLogs.createdAt, start))
  }

  const rows = await db.select({
    virtualKeyId: requestLogs.virtualKeyId,
    virtualKeyName: requestLogs.virtualKeyName,
    requestCount: sql<number>`count(*)`,
    successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`,
    failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`,
    totalInputTokens: sql<number>`coalesce(sum(${requestLogs.inputTokens}), 0)`,
    totalOutputTokens: sql<number>`coalesce(sum(${requestLogs.outputTokens}), 0)`,
    totalTokens: sql<number>`coalesce(sum(${requestLogs.totalTokens}), 0)`,
    avgResponseTimeMs: sql<number>`round(avg(${requestLogs.responseTimeMs}))`,
    lastUsedAt: sql<string>`max(${requestLogs.createdAt})`,
  }).from(requestLogs).where(and(...conditions)).groupBy(requestLogs.virtualKeyId, requestLogs.virtualKeyName)

  return rows.map((r) => ({
    virtualKeyId: r.virtualKeyId,
    virtualKeyName: r.virtualKeyName,
    requestCount: Number(r.requestCount),
    successCount: Number(r.successCount),
    failureCount: Number(r.failureCount),
    totalInputTokens: Number(r.totalInputTokens),
    totalOutputTokens: Number(r.totalOutputTokens),
    totalTokens: Number(r.totalTokens),
    avgResponseTimeMs: Number(r.avgResponseTimeMs),
    lastUsedAt: r.lastUsedAt ?? null,
  }))
}

export async function getProviderStats(range: DateRange) {
  const db = getDatabase()
  const conditions = [isNotNull(requestLogs.providerId), ...buildDateConditions(range)]
  const ttfbExpr = sql`(${requestLogs.metadata}->'performance'->>'providerTtfbMs')::numeric`

  return db.select({
    providerId: requestLogs.providerId,
    providerName: requestLogs.providerName,
    totalRequests: sql<number>`count(*)`.mapWith(Number),
    successCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success')`.mapWith(Number),
    failureCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'failure')`.mapWith(Number),
    avgResponseTime: sql<number>`round(avg(${requestLogs.responseTimeMs}))`.mapWith(Number),
    minResponseTime: sql<number>`min(${requestLogs.responseTimeMs})`.mapWith(Number),
    maxResponseTime: sql<number>`max(${requestLogs.responseTimeMs})`.mapWith(Number),
    p95ResponseTime: sql<number>`round(percentile_cont(0.95) within group (order by ${requestLogs.responseTimeMs}))`.mapWith(Number),
    avgTtfb: sql<number | null>`round(avg(${ttfbExpr}) filter (where ${requestLogs.status} = 'success' and ${ttfbExpr} is not null))`.mapWith(Number),
    p95Ttfb: sql<number | null>`round(percentile_cont(0.95) within group (order by ${ttfbExpr}) filter (where ${requestLogs.status} = 'success' and ${ttfbExpr} is not null))`.mapWith(Number),
    ttfbCount: sql<number>`count(*) filter (where ${requestLogs.status} = 'success' and ${ttfbExpr} is not null)`.mapWith(Number),
    lastRequestAt: sql<string>`max(${requestLogs.createdAt})`,
  }).from(requestLogs).where(and(...conditions)).groupBy(requestLogs.providerId, requestLogs.providerName).orderBy(sql`avg(${requestLogs.responseTimeMs}) asc nulls last`)
}
