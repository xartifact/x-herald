import { and, desc, gte, sql } from '@xartifact/x-herald-db'
import { Hono } from 'hono'

import { getDatabase } from '../../db/client'

import { AnomalyDetector } from './anomaly-detector'
import { anomalyEvents } from '@xartifact/x-herald-db'
import { instancePerfSnapshots } from '@xartifact/x-herald-db'

export const metricsRoutes = new Hono()

// PGlite 返回 { rows: [...] }，postgres.js 返回 array-like RowList
function toRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: unknown[] }).rows
  }
  return []
}

// ─── 工具函数 ────────────────────────────────────────────────────────────────

function periodToMs(period: string): number {
  switch (period) {
    case '1h':
      return 60 * 60 * 1000
    case '6h':
      return 6 * 60 * 60 * 1000
    case '24h':
      return 24 * 60 * 60 * 1000
    case '7d':
      return 7 * 24 * 60 * 60 * 1000
    default:
      return 6 * 60 * 60 * 1000
  }
}

function anomalyLevel(score: number | null): 'normal' | 'warning' | 'critical' {
  if (score === null || score < 2.0) return 'normal'
  if (score < 5.0) return 'warning'
  return 'critical'
}

// ─── GET /api/metrics/instances ──────────────────────────────────────────────
// 所有实例当前性能摘要（最近一个完整桶 + 24h 基线对比）

metricsRoutes.get('/instances', async (c) => {
  const db = getDatabase()
  const now = new Date()
  const since6hISO = new Date(now.getTime() - 6 * 60 * 60 * 1000).toISOString()
  const since24hISO = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // 查询每个实例：最新桶 + 过去 6h 基线（前 6~24h 的均值作为基线）
  const rows = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (instance_id)
        instance_id, instance_name, group_id, group_name, provider_id, provider_name,
        bucket_start,
        sample_count, success_count, error_count, success_rate,
        ttfb_avg, ttfb_p50, ttfb_p95, ttfb_p99,
        latency_avg, latency_p95,
        ttft_avg, ttft_p95,
        tps_avg, tps_p50,
        avg_input_tokens, avg_output_tokens
      FROM instance_perf_snapshots
      WHERE bucket_start >= ${since24hISO}::timestamp
      ORDER BY instance_id, bucket_start DESC
    ),
    baseline AS (
      SELECT
        instance_id,
        avg(ttfb_p95) AS baseline_ttfb_p95,
        avg(latency_p95) AS baseline_latency_p95,
        avg(success_rate) AS baseline_success_rate,
        avg(tps_avg) AS baseline_tps_avg,
        sum(sample_count) AS total_samples_24h
      FROM instance_perf_snapshots
      WHERE bucket_start >= ${since24hISO}::timestamp AND bucket_start < ${since6hISO}::timestamp
      GROUP BY instance_id
    )
    SELECT
      l.*,
      b.baseline_ttfb_p95,
      b.baseline_latency_p95,
      b.baseline_success_rate,
      b.baseline_tps_avg,
      b.total_samples_24h,
      CASE
        WHEN b.baseline_ttfb_p95 > 0 AND l.ttfb_p95 IS NOT NULL
        THEN round((l.ttfb_p95 / b.baseline_ttfb_p95)::numeric, 2)
        ELSE NULL
      END AS anomaly_score
    FROM latest l
    LEFT JOIN baseline b USING (instance_id)
    ORDER BY l.provider_name, l.instance_name
  `)

  const data = toRows(rows).map((r: unknown) => {
    const row = r as Record<string, unknown>
    const score = row.anomaly_score != null ? Number(row.anomaly_score) : null
    return {
      instanceId: row.instance_id,
      instanceName: row.instance_name,
      groupId: row.group_id,
      groupName: row.group_name,
      providerId: row.provider_id,
      providerName: row.provider_name,
      bucketStart: row.bucket_start,
      sampleCount: row.sample_count,
      successRate: row.success_rate != null ? Number(row.success_rate) : null,
      ttfbAvg: row.ttfb_avg != null ? Number(row.ttfb_avg) : null,
      ttfbP50: row.ttfb_p50 != null ? Number(row.ttfb_p50) : null,
      ttfbP95: row.ttfb_p95 != null ? Number(row.ttfb_p95) : null,
      ttfbP99: row.ttfb_p99 != null ? Number(row.ttfb_p99) : null,
      latencyAvg: row.latency_avg != null ? Number(row.latency_avg) : null,
      latencyP95: row.latency_p95 != null ? Number(row.latency_p95) : null,
      ttftAvg: row.ttft_avg != null ? Number(row.ttft_avg) : null,
      ttftP95: row.ttft_p95 != null ? Number(row.ttft_p95) : null,
      tpsAvg: row.tps_avg != null ? Number(row.tps_avg) : null,
      avgInputTokens: row.avg_input_tokens != null ? Number(row.avg_input_tokens) : null,
      avgOutputTokens: row.avg_output_tokens != null ? Number(row.avg_output_tokens) : null,
      baselineTtfbP95: row.baseline_ttfb_p95 != null ? Number(row.baseline_ttfb_p95) : null,
      baselineSuccessRate:
        row.baseline_success_rate != null ? Number(row.baseline_success_rate) : null,
      totalSamples24h: row.total_samples_24h != null ? Number(row.total_samples_24h) : null,
      anomalyScore: score,
      anomalyLevel: anomalyLevel(score),
    }
  })

  return c.json({ data })
})

// ─── GET /api/metrics/instances/:instanceId/timeseries ───────────────────────
// 单实例时序数据，用于折线图

metricsRoutes.get('/instances/:instanceId/timeseries', async (c) => {
  const { instanceId } = c.req.param()
  const period = c.req.query('period') ?? '6h'
  const db = getDatabase()
  const since = new Date(Date.now() - periodToMs(period))

  const rows = await db
    .select({
      bucketStart: instancePerfSnapshots.bucketStart,
      sampleCount: instancePerfSnapshots.sampleCount,
      successRate: instancePerfSnapshots.successRate,
      ttfbAvg: instancePerfSnapshots.ttfbAvg,
      ttfbP50: instancePerfSnapshots.ttfbP50,
      ttfbP95: instancePerfSnapshots.ttfbP95,
      latencyAvg: instancePerfSnapshots.latencyAvg,
      latencyP95: instancePerfSnapshots.latencyP95,
      ttftAvg: instancePerfSnapshots.ttftAvg,
      ttftP95: instancePerfSnapshots.ttftP95,
      tpsAvg: instancePerfSnapshots.tpsAvg,
      tpsP50: instancePerfSnapshots.tpsP50,
    })
    .from(instancePerfSnapshots)
    .where(
      and(
        sql`${instancePerfSnapshots.instanceId} = ${instanceId}`,
        gte(instancePerfSnapshots.bucketStart, since),
      ),
    )
    .orderBy(instancePerfSnapshots.bucketStart)

  // 计算基线：过去 6~24h 的均值
  const baseline6hStart = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const baseline6hEnd = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString()
  const baselineRows = await db.execute(sql`
    SELECT
      avg(ttfb_p95)::real AS baseline_ttfb_p95,
      avg(latency_p95)::real AS baseline_latency_p95,
      avg(tps_avg)::real AS baseline_tps_avg,
      avg(success_rate)::real AS baseline_success_rate
    FROM instance_perf_snapshots
    WHERE instance_id = ${instanceId}
      AND bucket_start >= ${baseline6hStart}
      AND bucket_start < ${baseline6hEnd}
  `)

  const bl = toRows(baselineRows)[0] as Record<string, unknown> | undefined

  return c.json({
    instanceId,
    period,
    data: rows,
    baseline: bl
      ? {
          ttfbP95: bl.baseline_ttfb_p95 != null ? Number(bl.baseline_ttfb_p95) : null,
          latencyP95: bl.baseline_latency_p95 != null ? Number(bl.baseline_latency_p95) : null,
          tpsAvg: bl.baseline_tps_avg != null ? Number(bl.baseline_tps_avg) : null,
          successRate: bl.baseline_success_rate != null ? Number(bl.baseline_success_rate) : null,
        }
      : null,
  })
})

// ─── GET /api/metrics/providers/quality ──────────────────────────────────────
// 供应商质量排名（过去 24h 聚合）

metricsRoutes.get('/providers/quality', async (c) => {
  const db = getDatabase()
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const rows = await db.execute(sql`
    SELECT
      provider_id,
      provider_name,
      count(DISTINCT instance_id) AS instance_count,
      sum(sample_count) AS total_requests,
      round(avg(success_rate)::numeric, 4)::real AS avg_success_rate,
      round(avg(ttfb_avg)::numeric, 1)::real AS avg_ttfb,
      round(percentile_cont(0.95) WITHIN GROUP (ORDER BY ttfb_p95)::numeric, 1)::real AS ttfb_p95,
      round(avg(tps_avg)::numeric, 2)::real AS avg_tps,
      round(avg(latency_avg)::numeric, 1)::real AS avg_latency,
      round(avg(avg_retry_count)::numeric, 3)::real AS avg_retry_rate
    FROM instance_perf_snapshots
    WHERE bucket_start >= ${since}
      AND provider_id IS NOT NULL
    GROUP BY provider_id, provider_name
    ORDER BY avg_success_rate DESC NULLS LAST, avg_ttfb ASC NULLS LAST
  `)

  const data = toRows(rows).map((r: unknown) => {
    const row = r as Record<string, unknown>
    const successRate = row.avg_success_rate != null ? Number(row.avg_success_rate) : 0
    const ttfb = row.avg_ttfb != null ? Number(row.avg_ttfb) : 0
    // qualityScore: 成功率权重 60%，TTFB 倒数权重 40%（归一化到 1000ms 基准）
    const ttfbScore = ttfb > 0 ? Math.min(1, 1000 / ttfb) : 0
    const qualityScore = Math.round((successRate * 60 + ttfbScore * 40) * 100) / 100

    return {
      providerId: row.provider_id,
      providerName: row.provider_name,
      instanceCount: Number(row.instance_count),
      totalRequests: Number(row.total_requests),
      avgSuccessRate: successRate,
      avgTtfb: ttfb,
      ttfbP95: row.ttfb_p95 != null ? Number(row.ttfb_p95) : null,
      avgTps: row.avg_tps != null ? Number(row.avg_tps) : null,
      avgLatency: row.avg_latency != null ? Number(row.avg_latency) : null,
      avgRetryRate: row.avg_retry_rate != null ? Number(row.avg_retry_rate) : null,
      qualityScore,
    }
  })

  return c.json({ data })
})

// ─── GET /api/metrics/summary ─────────────────────────────────────────────────
// 全局汇总（顶部 card 数据）

metricsRoutes.get('/summary', async (c) => {
  const db = getDatabase()
  const since1h = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const [recent, daily] = await Promise.all([
    db.execute(sql`
      SELECT
        sum(sample_count) AS total_requests,
        round(sum(success_count)::numeric / NULLIF(sum(sample_count), 0), 4)::real AS avg_success_rate,
        round(sum(ttfb_p95 * sample_count)::numeric / NULLIF(sum(sample_count), 0), 1)::real AS avg_ttfb_p95,
        count(DISTINCT instance_id) AS active_instances
      FROM instance_perf_snapshots
      WHERE bucket_start >= ${since1h}
    `),
    db.execute(sql`
      SELECT
        sum(sample_count) AS total_requests_24h,
        count(DISTINCT instance_id) AS active_instances_24h
      FROM instance_perf_snapshots
      WHERE bucket_start >= ${since24h}
    `),
  ])

  const r = toRows(recent)[0] as Record<string, unknown> | undefined
  const d = toRows(daily)[0] as Record<string, unknown> | undefined

  // 统计当前异常实例数（最新桶 TTFB P95 > 2x 基线）
  const anomalyRows = await db.execute(sql`
    WITH latest AS (
      SELECT DISTINCT ON (instance_id)
        instance_id, ttfb_p95
      FROM instance_perf_snapshots
      WHERE bucket_start >= ${since1h}
      ORDER BY instance_id, bucket_start DESC
    ),
    baseline AS (
      SELECT
        instance_id,
        avg(ttfb_p95) AS baseline_ttfb_p95
      FROM instance_perf_snapshots
      WHERE bucket_start >= ${since24h}
        AND bucket_start < ${since1h}
      GROUP BY instance_id
    )
    SELECT count(*) AS anomaly_count
    FROM latest l
    LEFT JOIN baseline b USING (instance_id)
    WHERE l.ttfb_p95 IS NOT NULL
      AND (
        -- 有基线：当前 TTFB P95 > 基线 2 倍
        (b.baseline_ttfb_p95 IS NOT NULL AND b.baseline_ttfb_p95 > 0 AND l.ttfb_p95 > b.baseline_ttfb_p95 * 2)
        OR
        -- 无基线：TTFB P95 > 30s 视为异常（冷启动场景）
        (b.baseline_ttfb_p95 IS NULL AND l.ttfb_p95 > 30000)
      )
  `)

  const anomaly = toRows(anomalyRows)[0] as Record<string, unknown> | undefined

  return c.json({
    recentHour: {
      totalRequests: r?.total_requests != null ? Number(r.total_requests) : 0,
      avgSuccessRate: r?.avg_success_rate != null ? Number(r.avg_success_rate) : null,
      avgTtfbP95: r?.avg_ttfb_p95 != null ? Number(r.avg_ttfb_p95) : null,
      activeInstances: r?.active_instances != null ? Number(r.active_instances) : 0,
    },
    daily: {
      totalRequests: d?.total_requests_24h != null ? Number(d.total_requests_24h) : 0,
      activeInstances: d?.active_instances_24h != null ? Number(d.active_instances_24h) : 0,
    },
    anomalyCount: anomaly?.anomaly_count != null ? Number(anomaly.anomaly_count) : 0,
  })
})

// ─── GET /api/metrics/anomalies ──────────────────────────────────────────────
// List anomaly events

metricsRoutes.get('/anomalies', async (c) => {
  const { unresolved } = c.req.query()
  const db = getDatabase()
  const detector = new AnomalyDetector()
  const events =
    unresolved === 'true'
      ? await detector.getUnresolved()
      : await db.select().from(anomalyEvents).orderBy(desc(anomalyEvents.createdAt)).limit(100)
  return c.json({ success: true, data: events })
})

// ─── POST /api/metrics/anomalies/detect ──────────────────────────────────────
// Run detection

metricsRoutes.post('/anomalies/detect', async (c) => {
  const detector = new AnomalyDetector()
  const newEvents = await detector.detect()
  return c.json({ success: true, data: { newEvents } })
})

// ─── PATCH /api/metrics/anomalies/:id/resolve ────────────────────────────────
// Resolve anomaly

metricsRoutes.patch('/anomalies/:id/resolve', async (c) => {
  const detector = new AnomalyDetector()
  await detector.resolve(c.req.param('id'))
  return c.json({ success: true })
})
