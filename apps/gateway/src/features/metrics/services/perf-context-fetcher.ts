import { sql } from '@xartifact/x-llm-gateway-db'

import { getDatabase } from '../../../db/client'
import logger from '../../../lib/logger'
import type { PerfContext } from '../../../gateway/services/route-rule-engine'

const CACHE_TTL_MS = 60_000
const cache = new Map<string, { ctx: PerfContext; expiresAt: number }>()

const DEFAULT_PERF: PerfContext = {
  worstAnomalyLevel: 'unknown',
  maxAnomalyScore: null,
  minSuccessRate: null,
  maxTtfbP95: null,
  healthyRatio: 1,
}

function toRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: unknown[] }).rows
  }
  return []
}

function anomalyLevel(score: number | null): 'normal' | 'warning' | 'critical' | 'unknown' {
  if (score === null) return 'unknown'
  if (score >= 5) return 'critical'
  if (score >= 2) return 'warning'
  return 'normal'
}

export async function fetchPerfContext(vmId: string, groupIds: string[]): Promise<PerfContext> {
  if (groupIds.length === 0) return DEFAULT_PERF

  const cacheKey = `${vmId}:${[...groupIds].toSorted().join(',')}`
  const cached = cache.get(cacheKey)
  if (cached && cached.expiresAt > Date.now()) return cached.ctx

  try {
    const db = getDatabase()
    // 使用 string_to_array 将逗号分隔字符串转为 text 数组，
    // 避免 Drizzle sql 模板对 JS 数组的错误序列化（将 [uuid] 转为 'uuid' 而非 '{uuid}'）。
    // group_id 列是 varchar 类型，所以用 text[] 类型转换。
    const groupIdsStr = groupIds.join(',')
    const rows = toRows(
      await db.execute(sql`
      WITH latest AS (
        SELECT DISTINCT ON (instance_id)
          instance_id, success_rate, ttfb_p95
        FROM instance_perf_snapshots
        WHERE group_id = ANY(string_to_array(${groupIdsStr}, ','))
          AND bucket_start >= NOW() - INTERVAL '10 minutes'
        ORDER BY instance_id, bucket_start DESC
      ),
      baseline AS (
        SELECT instance_id, avg(ttfb_p95) AS base_ttfb_p95
        FROM instance_perf_snapshots
        WHERE group_id = ANY(string_to_array(${groupIdsStr}, ','))
          AND bucket_start >= NOW() - INTERVAL '24 hours'
          AND bucket_start < NOW() - INTERVAL '6 hours'
        GROUP BY instance_id
      )
      SELECT
        max(l.ttfb_p95 / NULLIF(b.base_ttfb_p95, 0)) AS max_anomaly_score,
        min(l.success_rate) AS min_success_rate,
        max(l.ttfb_p95) AS max_ttfb_p95,
        count(*) FILTER (
          WHERE l.ttfb_p95 / NULLIF(b.base_ttfb_p95, 0) IS NULL
             OR l.ttfb_p95 / NULLIF(b.base_ttfb_p95, 0) < 5
        )::integer AS healthy_count,
        count(*)::integer AS total_count
      FROM latest l
      LEFT JOIN baseline b USING (instance_id)
    `),
    )

    if (rows.length === 0) {
      cache.set(cacheKey, { ctx: DEFAULT_PERF, expiresAt: Date.now() + CACHE_TTL_MS })
      return DEFAULT_PERF
    }

    const row = rows[0] as Record<string, unknown>
    const maxScore = row.max_anomaly_score != null ? Number(row.max_anomaly_score) : null
    const totalCount = Number(row.total_count ?? 0)
    const healthyCount = Number(row.healthy_count ?? 0)

    const ctx: PerfContext = {
      worstAnomalyLevel: anomalyLevel(maxScore),
      maxAnomalyScore: maxScore,
      minSuccessRate: row.min_success_rate != null ? Number(row.min_success_rate) : null,
      maxTtfbP95: row.max_ttfb_p95 != null ? Number(row.max_ttfb_p95) : null,
      healthyRatio: totalCount > 0 ? healthyCount / totalCount : 1,
    }

    cache.set(cacheKey, { ctx, expiresAt: Date.now() + CACHE_TTL_MS })
    return ctx
  } catch (err) {
    logger.warn({ err, vmId, groupIds }, 'Failed to fetch perf context for routing')
    return DEFAULT_PERF
  }
}
