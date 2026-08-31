/**
 * Routing Trace Query Service
 *
 * 从 request_logs.metadata.routing.routeChain (JSONB) + request_attempts 表
 * 联合查询，重组出完整的路由链路追踪。
 *
 * 设计：
 *   - 每个 requestGroupId 对应一次客户端请求
 *   - 同一 group 下有 N 个 request_logs 行（每个候选 attempt 一条）
 *   - metadata.routing.routeChain 在每个 attempt 的 log 里都有副本（planned chain）
 *   - request_attempts 记录每次尝试的 HTTP 细节
 *   - 胜出的 attempt = status='success' 的 candidateIndex==0 行
 */

import { and, desc, eq, lt, or, sql } from '@xartifact/x-herald-db'
import type { SQL } from 'drizzle-orm'
import type { RouteCondition } from '@xartifact/x-herald-shared'

import { getDatabase } from '../../db/client'
import { requestAttempts, requestLogs } from '@xartifact/x-herald-db'

export interface RoutingTraceFilters {
  startDate?: string
  endDate?: string
  modelName?: string
  /** 命中规则 ID */
  matchedRuleId?: string
  /** outcome: success / rejected / all_failed / pending（请求仍在进行中，尚无终态） */
  outcome?: 'success' | 'rejected' | 'all_failed' | 'pending'
  /** 是否包含跨 provider 降级（routeChain 含 backup step） */
  hasFailover?: boolean
  virtualKeyId?: string
  pageSize: number
  cursor?: string
}

interface RoutingTraceListRow {
  id: string
  requestGroupId: string
  candidateIndex: number
  status: string
  statusCode: number | null
  providerId: string | null
  providerName: string | null
  virtualKeyId: string | null
  modelName: string
  originalModelName: string | null
  createdAt: Date
  /** 整个 routeChain JSONB，在 JS 层解析（减少 DB 侧 JSONB 提取次数） */
  routeChain: unknown
  finalInstanceName: string | null
  responseTimeMs: number
}

export async function listRoutingTraces(filters: RoutingTraceFilters) {
  const db = getDatabase()
  const conds: SQL[] = []

  // 仅查询 candidateIndex = 0 的日志行（每 group 一行；该行含完整 routeChain）
  conds.push(eq(requestLogs.candidateIndex, 0))
  // 只看有 chain 的（即新逻辑产生的请求；legacy 请求 chain 不存在则过滤）
  conds.push(sql`(${requestLogs.metadata}->'routing'->'routeChain') IS NOT NULL`)

  if (filters.startDate) conds.push(sql`${requestLogs.createdAt} >= ${new Date(filters.startDate)}`)
  if (filters.endDate) conds.push(sql`${requestLogs.createdAt} <= ${new Date(filters.endDate)}`)
  if (filters.modelName)
    conds.push(
      sql`(${requestLogs.modelName} = ${filters.modelName} OR ${requestLogs.originalModelName} = ${filters.modelName})`,
    )
  if (filters.virtualKeyId) conds.push(eq(requestLogs.virtualKeyId, filters.virtualKeyId))
  if (filters.matchedRuleId)
    conds.push(
      sql`${requestLogs.metadata}->'routing'->'routeChain'->>'matchedRuleId' = ${filters.matchedRuleId}`,
    )
  if (filters.outcome === 'success') {
    conds.push(eq(requestLogs.status, 'success'))
  } else if (filters.outcome === 'rejected') {
    // rejected 专指路由规则主动拒绝（reject 节点），记在 routeChain.outcome 里
    conds.push(
      and(
        eq(requestLogs.status, 'failure'),
        sql`${requestLogs.metadata}->'routing'->'routeChain'->>'outcome' = 'rejected'`,
      )!,
    )
  } else if (filters.outcome === 'all_failed') {
    // all_failed：链路耗尽/无可用实例/全部候选调用失败 —— 除 rejected 外的所有失败
    conds.push(
      and(
        eq(requestLogs.status, 'failure'),
        sql`(${requestLogs.metadata}->'routing'->'routeChain'->>'outcome') IS DISTINCT FROM 'rejected'`,
      )!,
    )
  } else if (filters.outcome === 'pending') {
    // pending：请求仍在进行中（流式请求异步落库的中间态），尚无终态，不能算作失败
    conds.push(eq(requestLogs.status, 'pending'))
  }
  if (filters.hasFailover)
    conds.push(
      sql`(${requestLogs.metadata}->'routing'->'routeChain'->'chain') @> '[{"kind": "backup"}]'::jsonb`,
    )

  // 游标分页：使用 Drizzle `lt`/`eq`/`and`/`or` 而非 raw `sql` template。
  // raw sql template 中的 `${new Date(...)}` 会被 postgres.js driver 拒绝
  // （只接受 string/Buffer/ArrayBuffer），导致 page 2 查询 500。
  if (filters.cursor) {
    const cursorPredicate = buildCursorPredicate(filters.cursor)
    if (cursorPredicate) conds.push(cursorPredicate)
  }

  const rows = await db
    .select({
      id: requestLogs.id,
      requestGroupId: requestLogs.requestGroupId,
      candidateIndex: requestLogs.candidateIndex,
      status: requestLogs.status,
      statusCode: requestLogs.statusCode,
      providerId: requestLogs.providerId,
      providerName: requestLogs.providerName,
      virtualKeyId: requestLogs.virtualKeyId,
      modelName: requestLogs.modelName,
      originalModelName: requestLogs.originalModelName,
      createdAt: requestLogs.createdAt,
      // 一次提取整个 routeChain JSONB，JS 层解析（替代 6 次深度 JSONB 提取）
      routeChain: sql<unknown>`${requestLogs.metadata}->'routing'->'routeChain'`,
      finalInstanceName: sql<string | null>`${requestLogs.metadata}->'routing'->>'actualModelName'`,
      responseTimeMs: requestLogs.responseTimeMs,
    })
    .from(requestLogs)
    .where(and(...conds))
    .orderBy(desc(requestLogs.createdAt), desc(requestLogs.id))
    .limit(filters.pageSize + 1)

  const hasMore = rows.length > filters.pageSize
  const items = (hasMore ? rows.slice(0, filters.pageSize) : rows).map(toTraceSummary)
  let nextCursor: string | null = null
  if (hasMore && items.length > 0) {
    const last = rows[filters.pageSize - 1]
    nextCursor = Buffer.from(
      JSON.stringify({
        createdAt: last.createdAt.toISOString(),
        id: last.id,
      }),
    ).toString('base64')
  }
  return { items, nextCursor, hasMore }
}

/**
 * Build the keyset cursor predicate for `listRoutingTraces`.
 *
 * Returns `null` if the cursor is malformed (in which case the caller
 * should fall back to the first page). The predicate is built using
 * Drizzle's `lt`/`eq`/`and`/`or` so the bound parameters are strings —
 * postgres.js rejects raw `Date` instances as parameter values.
 */
export function buildCursorPredicate(cursor: string): SQL | null {
  try {
    const { createdAt, id } = JSON.parse(Buffer.from(cursor, 'base64').toString()) as {
      createdAt: string
      id: string
    }
    const cursorDate = new Date(createdAt)
    return or(
      lt(requestLogs.createdAt, cursorDate),
      and(eq(requestLogs.createdAt, cursorDate), lt(requestLogs.id, id))!,
    )!
  } catch {
    return null
  }
}
interface RouteChainShape {
  matchedRule?: { id: string; name: string } | null
  chain?: Array<{ kind?: string; candidates?: unknown[] }>
  /** 路由未产出候选就结束时的原因（reject / 无可用实例），success 请求不设置 */
  outcome?: 'rejected' | 'all_failed'
}

/**
 * request_logs.status 只有 success/failure/pending 三种；rejected vs all_failed
 * 这层更细的语义存在 routeChain.outcome 里（见 routing-trace-recorder.ts），
 * 不能直接把 status 强转成 RoutingTraceSummary 的 outcome 类型。
 *
 * status='pending' 必须单独判为 'pending'，不能落进 all_failed 兜底——流式请求
 * 落库是"先插入 pending 行、结束时再更新"的两段式（见 log-stream.ts），客户端
 * 中途断开或进程重启都可能让这行永远停在 pending。把它当作"全部失败"展示是
 * 误判：请求可能仍在进行中，也可能是异常卡死，但绝不是"已尝试过且失败"。
 */
function deriveOutcome(
  status: string,
  storedOutcome?: 'rejected' | 'all_failed',
): 'success' | 'rejected' | 'all_failed' | 'pending' {
  if (status === 'success') return 'success'
  if (status === 'pending') return 'pending'
  return storedOutcome ?? 'all_failed'
}

function toTraceSummary(row: RoutingTraceListRow) {
  const chain = (row.routeChain as RouteChainShape | null) ?? {}
  const chainSteps = chain.chain ?? []
  return {
    logId: row.id,
    requestGroupId: row.requestGroupId,
    requestedModel: row.originalModelName ?? row.modelName,
    accessModelName: row.modelName,
    matchedRuleId: chain.matchedRule?.id ?? undefined,
    matchedRuleName: chain.matchedRule?.name ?? undefined,
    outcome: deriveOutcome(row.status, chain.outcome),
    finalChainKind: row.status === 'success' ? (chainSteps[0]?.kind ?? 'single') : undefined,
    finalInstanceName: row.finalInstanceName ?? row.modelName,
    finalProviderName: row.providerName ?? undefined,
    totalAttempts: chainSteps.reduce((sum, s) => sum + (s.candidates?.length ?? 0), 0),
    totalDurationMs: row.responseTimeMs,
    createdAt: row.createdAt.toISOString(),
    requestLogId: row.id,
  }
}

/**
 * 获取单个 trace 的完整详情（含每个候选的 attempt outcome）
 */
export async function getRoutingTraceDetail(logId: string) {
  const db = getDatabase()

  // 主行（candidateIndex = 0，含完整 routeChain）
  const [mainRow] = await db.select().from(requestLogs).where(eq(requestLogs.id, logId)).limit(1)

  if (!mainRow) return null

  const chainRaw = (mainRow.metadata as Record<string, unknown> | null)?.routing as Record<
    string,
    unknown
  > | null
  const routeChain = chainRaw?.routeChain as
    | {
        requestedModel?: string
        accessModelId?: string
        accessModelName?: string
        matchedRule?: {
          id: string
          name: string
          priority: number
          conditions?: RouteCondition[]
        }
        chain?: Array<{
          index: number
          kind: 'primary' | 'backup' | 'single'
          actionType: string
          resolvedGroupId?: string
          resolvedGroupName?: string
          intentName?: string
          intentSource?: string
          intentTrace?: {
            intentName?: string
            intentSource?: string
            confidence?: number
            userMessage?: string
            capabilities?: string[]
            classifierCategory?: string | null
            classifierRawResponse?: string | null
            classifierModelName?: string | null
            classifierLatencyMs?: number
            classifierStatusCode?: number | null
          }
          capabilities?: string[]
          decisionReason?: string
          filteredOut?: Array<{ instanceName: string; reason: string }>
          candidates?: Array<{
            candidateIndex: number
            chainStepIndex: number
            chainStepKind: 'primary' | 'backup' | 'single'
            instanceId: string
            instanceName: string
            providerId: string
            providerName: string
            priority: number
            strategy: string
            groupName: string
            selectionReason?: string
          }>
        }>
        outcome?: 'rejected' | 'all_failed'
      }
    | undefined

  if (!routeChain) return null

  // 拉取所有 attempts（按 candidateIndex 关联）
  const [attempts, logRows] = await Promise.all([
    db
      .select({
        id: requestAttempts.id,
        candidateIndex: requestAttempts.candidateIndex,
        status: requestAttempts.status,
        statusCode: requestAttempts.statusCode,
        failoverReason: requestAttempts.failoverReason,
        retryCount: requestAttempts.retryCount,
        ttfbMs: requestAttempts.ttfbMs,
        durationMs: requestAttempts.durationMs,
        providerName: requestAttempts.providerName,
      })
      .from(requestAttempts)
      .where(eq(requestAttempts.requestGroupId, mainRow.requestGroupId))
      .orderBy(requestAttempts.candidateIndex),
    // 拉取同 group 下所有 request_logs 行（每个候选一条），用于关联请求详情
    db
      .select({
        id: requestLogs.id,
        candidateIndex: requestLogs.candidateIndex,
      })
      .from(requestLogs)
      .where(eq(requestLogs.requestGroupId, mainRow.requestGroupId)),
  ])

  const attemptsByIndex = new Map<number, (typeof attempts)[number]>()
  for (const a of attempts) attemptsByIndex.set(a.candidateIndex, a)

  const logIdByIndex = new Map<number, string>()
  for (const r of logRows) logIdByIndex.set(r.candidateIndex, r.id)

  // 重组 chain：把每个 candidate 的 outcome + requestLogId 填进去
  const enrichedChain = (routeChain.chain ?? []).map((step) => ({
    ...step,
    candidates: (step.candidates ?? []).map((c) => {
      const att = attemptsByIndex.get(c.candidateIndex)
      return {
        ...c,
        matched: !!att,
        status: att?.status as 'success' | 'failed' | 'pending' | undefined,
        statusCode: att?.statusCode ?? undefined,
        failoverReason: att?.failoverReason ?? undefined,
        durationMs: att?.durationMs ?? undefined,
        requestLogId: logIdByIndex.get(c.candidateIndex),
      }
    }),
  }))

  const finalCandidate = enrichedChain
    .flatMap((s) => s.candidates)
    .find((c) => c.status === 'success')

  return {
    logId: mainRow.id,
    requestGroupId: mainRow.requestGroupId,
    requestedModel: routeChain.requestedModel ?? mainRow.originalModelName ?? mainRow.modelName,
    accessModelId: routeChain.accessModelId,
    accessModelName: routeChain.accessModelName ?? mainRow.modelName,
    matchedRule: routeChain.matchedRule,
    chain: enrichedChain,
    outcome: deriveOutcome(mainRow.status, routeChain.outcome),
    errorMessage: mainRow.errorMessage ?? undefined,
    finalCandidate: finalCandidate
      ? {
          chainStepIndex: finalCandidate.chainStepIndex,
          chainStepKind: finalCandidate.chainStepKind,
          candidateIndex: finalCandidate.candidateIndex,
          instanceId: finalCandidate.instanceId,
          instanceName: finalCandidate.instanceName,
          providerId: finalCandidate.providerId,
          providerName: finalCandidate.providerName,
        }
      : undefined,
    totalAttempts: enrichedChain.flatMap((s) => s.candidates).filter((c) => c.matched).length,
    totalDurationMs: mainRow.responseTimeMs,
    createdAt: mainRow.createdAt.toISOString(),
    requestLogId: mainRow.id,
  }
}
