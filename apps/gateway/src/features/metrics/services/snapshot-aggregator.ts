import { sql } from '@xartifact/x-herald-db'

import { getDatabase } from '../../../db/client'
import rootLogger from '../../../lib/logger'

const logger = rootLogger.child({ module: 'snapshot-aggregator' })

/**
 * 将时间戳对齐到最近的 5 分钟桶起始点
 */
function alignToBucket(date: Date, bucketMinutes = 5): Date {
  const ms = date.getTime()
  const bucketMs = bucketMinutes * 60 * 1000
  return new Date(Math.floor(ms / bucketMs) * bucketMs)
}

/**
 * 聚合指定时间桶内的所有 request_logs，写入 instance_perf_snapshots
 * bucketStart 必须已对齐到 5 分钟边界
 */
export async function aggregateBucket(bucketStart: Date, bucketMinutes = 5): Promise<number> {
  const db = getDatabase()
  const bucketEnd = new Date(bucketStart.getTime() + bucketMinutes * 60 * 1000)

  // 手动序列化 Date 为 ISO 字符串，避免 postgres.js driver 类型错误
  // ("The string argument must be of type string... Received an instance of Date")
  const bucketStartStr = bucketStart.toISOString()
  const bucketEndStr = bucketEnd.toISOString()

  // 使用 percentile_cont 聚合，从 request_logs JSONB 字段中提取指标
  // 仅处理已完成（is_complete=true）且有 instanceId 路由信息的请求
  const result = await db.execute(sql`
    INSERT INTO instance_perf_snapshots (
      id, instance_id, instance_name, group_id, group_name,
      provider_id, provider_name,
      bucket_start, bucket_end,
      sample_count, success_count, error_count, success_rate,
      ttfb_avg, ttfb_p50, ttfb_p95, ttfb_p99, ttfb_min, ttfb_max,
      latency_avg, latency_p50, latency_p95, latency_p99,
      ttft_avg, ttft_p95,
      tps_avg, tps_p50,
      avg_input_tokens, avg_output_tokens, avg_retry_count,
      created_at
    )
    SELECT
      gen_random_uuid(),
      (metadata -> 'routing' ->> 'instanceId') AS instance_id,
      NULL AS instance_name,
      (metadata -> 'routing' ->> 'modelGroupId') AS group_id,
      (metadata -> 'routing' ->> 'modelGroupName') AS group_name,
      provider_id::text AS provider_id,
      provider_name,
      ${bucketStartStr}::timestamp AS bucket_start,
      ${bucketEndStr}::timestamp AS bucket_end,

      count(*)::integer AS sample_count,
      count(*) FILTER (WHERE status = 'success')::integer AS success_count,
      count(*) FILTER (WHERE status = 'failure')::integer AS error_count,
      round(
        count(*) FILTER (WHERE status = 'success')::numeric / NULLIF(count(*), 0),
        4
      )::real AS success_rate,

      -- TTFB (providerTtfbMs)
      avg(
        NULLIF((metadata -> 'performance' ->> 'providerTtfbMs')::real, 0)
      )::real AS ttfb_avg,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY NULLIF((metadata -> 'performance' ->> 'providerTtfbMs')::real, 0)
      )::real AS ttfb_p50,
      percentile_cont(0.95) WITHIN GROUP (
        ORDER BY NULLIF((metadata -> 'performance' ->> 'providerTtfbMs')::real, 0)
      )::real AS ttfb_p95,
      percentile_cont(0.99) WITHIN GROUP (
        ORDER BY NULLIF((metadata -> 'performance' ->> 'providerTtfbMs')::real, 0)
      )::real AS ttfb_p99,
      min(
        NULLIF((metadata -> 'performance' ->> 'providerTtfbMs')::real, 0)
      )::real AS ttfb_min,
      max(
        NULLIF((metadata -> 'performance' ->> 'providerTtfbMs')::real, 0)
      )::real AS ttfb_max,

      -- 总响应时间
      avg(NULLIF(response_time_ms, 0))::real AS latency_avg,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY NULLIF(response_time_ms, 0)
      )::real AS latency_p50,
      percentile_cont(0.95) WITHIN GROUP (
        ORDER BY NULLIF(response_time_ms, 0)
      )::real AS latency_p95,
      percentile_cont(0.99) WITHIN GROUP (
        ORDER BY NULLIF(response_time_ms, 0)
      )::real AS latency_p99,

      -- TTFT (ttfbToFirstTextMs，仅流式)
      avg(
        CASE WHEN streaming = 'true'
        THEN NULLIF((metadata -> 'performance' ->> 'ttfbToFirstTextMs')::real, 0)
        END
      )::real AS ttft_avg,
      percentile_cont(0.95) WITHIN GROUP (
        ORDER BY CASE WHEN streaming = 'true'
          THEN NULLIF((metadata -> 'performance' ->> 'ttfbToFirstTextMs')::real, 0)
          END
      )::real AS ttft_p95,

      -- TPS = output_tokens / (streamDurationMs / 1000)，仅流式且有 streamDurationMs
      avg(
        CASE
          WHEN streaming = 'true'
            AND NULLIF((metadata -> 'performance' ->> 'streamDurationMs')::real, 0) IS NOT NULL
            AND output_tokens > 0
          THEN output_tokens::real / ((metadata -> 'performance' ->> 'streamDurationMs')::real / 1000.0)
        END
      )::real AS tps_avg,
      percentile_cont(0.5) WITHIN GROUP (
        ORDER BY CASE
          WHEN streaming = 'true'
            AND NULLIF((metadata -> 'performance' ->> 'streamDurationMs')::real, 0) IS NOT NULL
            AND output_tokens > 0
          THEN output_tokens::real / ((metadata -> 'performance' ->> 'streamDurationMs')::real / 1000.0)
          END
      )::real AS tps_p50,

      avg(NULLIF(input_tokens, 0))::real AS avg_input_tokens,
      avg(NULLIF(output_tokens, 0))::real AS avg_output_tokens,
      avg(retry_count)::real AS avg_retry_count,

      now() AS created_at

    FROM request_logs
    WHERE
      is_complete = true
      AND created_at >= ${bucketStartStr}::timestamp
      AND created_at < ${bucketEndStr}::timestamp
      AND (metadata -> 'routing' ->> 'instanceId') IS NOT NULL
    GROUP BY
      (metadata -> 'routing' ->> 'instanceId'),
      (metadata -> 'routing' ->> 'modelGroupId'),
      (metadata -> 'routing' ->> 'modelGroupName'),
      provider_id,
      provider_name

    ON CONFLICT (instance_id, bucket_start) DO UPDATE SET
      sample_count = EXCLUDED.sample_count,
      success_count = EXCLUDED.success_count,
      error_count = EXCLUDED.error_count,
      success_rate = EXCLUDED.success_rate,
      ttfb_avg = EXCLUDED.ttfb_avg,
      ttfb_p50 = EXCLUDED.ttfb_p50,
      ttfb_p95 = EXCLUDED.ttfb_p95,
      ttfb_p99 = EXCLUDED.ttfb_p99,
      ttfb_min = EXCLUDED.ttfb_min,
      ttfb_max = EXCLUDED.ttfb_max,
      latency_avg = EXCLUDED.latency_avg,
      latency_p50 = EXCLUDED.latency_p50,
      latency_p95 = EXCLUDED.latency_p95,
      latency_p99 = EXCLUDED.latency_p99,
      ttft_avg = EXCLUDED.ttft_avg,
      ttft_p95 = EXCLUDED.ttft_p95,
      tps_avg = EXCLUDED.tps_avg,
      tps_p50 = EXCLUDED.tps_p50,
      avg_input_tokens = EXCLUDED.avg_input_tokens,
      avg_output_tokens = EXCLUDED.avg_output_tokens,
      avg_retry_count = EXCLUDED.avg_retry_count
  `)

  const resultRows = Array.isArray(result) ? result : ((result as { rows?: unknown[] })?.rows ?? [])
  const rowCount = resultRows.length
  logger.debug({ bucketStart, bucketEnd, rowCount }, 'Perf snapshot aggregated')
  return rowCount
}

/**
 * 聚合最近 N 个桶（补齐历史数据，重启时调用）
 */
export async function aggregateRecentBuckets(bucketCount = 12, bucketMinutes = 5): Promise<void> {
  const now = new Date()
  const aligned = alignToBucket(now, bucketMinutes)

  for (let i = bucketCount; i >= 1; i--) {
    const bucketStart = new Date(aligned.getTime() - i * bucketMinutes * 60 * 1000)
    try {
      await aggregateBucket(bucketStart, bucketMinutes)
    } catch (err) {
      logger.warn({ err, bucketStart }, 'Failed to aggregate bucket')
    }
  }
}

export { alignToBucket }
