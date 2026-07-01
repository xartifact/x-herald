import { sql } from '@xartifact/x-llm-gateway-db';

import { getDatabase } from '../../../db/client';
import logger from '../../../lib/logger';

export interface InstancePerfData {
  ttfbAvg: number | null;
  ttfbP95: number | null;
  latencyAvg: number | null;
  successRate: number | null;
  avgRetryCount: number | null;
}

const CACHE_TTL_MS = 30_000;
const cache = new Map<string, { data: Map<string, InstancePerfData>; expiresAt: number }>();

function toRows(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: unknown[] }).rows;
  }
  return [];
}

export async function fetchGroupInstancesPerf(groupId: string): Promise<Map<string, InstancePerfData>> {
  const cached = cache.get(groupId);
  if (cached && cached.expiresAt > Date.now()) return cached.data;

  try {
    const db = getDatabase();
    const rows = toRows(await db.execute(sql`
      SELECT DISTINCT ON (instance_id)
        instance_id,
        ttfb_avg,
        ttfb_p95,
        latency_avg,
        success_rate,
        avg_retry_count
      FROM instance_perf_snapshots
      WHERE group_id = ${groupId}
        AND bucket_start >= NOW() - INTERVAL '15 minutes'
      ORDER BY instance_id, bucket_start DESC
    `));

    const data = new Map<string, InstancePerfData>();
    for (const r of rows) {
      const row = r as Record<string, unknown>;
      data.set(String(row.instance_id), {
        ttfbAvg: row.ttfb_avg != null ? Number(row.ttfb_avg) : null,
        ttfbP95: row.ttfb_p95 != null ? Number(row.ttfb_p95) : null,
        latencyAvg: row.latency_avg != null ? Number(row.latency_avg) : null,
        successRate: row.success_rate != null ? Number(row.success_rate) : null,
        avgRetryCount: row.avg_retry_count != null ? Number(row.avg_retry_count) : null,
      });
    }

    cache.set(groupId, { data, expiresAt: Date.now() + CACHE_TTL_MS });
    return data;
  } catch (err) {
    logger.warn({ err, groupId }, 'Failed to fetch instance perf data for routing');
    return new Map();
  }
}
