import { and, desc, eq, gte } from '@xartifact/x-llm-gateway-db';

import { getDatabase } from '../../db/client';

import { anomalyEvents, type AnomalyEvent } from '@xartifact/x-llm-gateway-db';
import { instancePerfSnapshots } from '@xartifact/x-llm-gateway-db';

// Detection rules
interface DetectionRule {
  type: string;
  severity: 'warning' | 'critical';
  check: (data: Record<string, unknown>) => boolean;
  describe: (data: Record<string, unknown>) => string;
}

const rules: DetectionRule[] = [
  {
    type: 'slow_request',
    severity: 'warning',
    check: (data) => typeof data.ttfbP95 === 'number' && data.ttfbP95 > 10_000, // 10s TTFB
    describe: (data) => `High TTFB: ${data.ttfbP95}ms (P95)`,
  },
  {
    type: 'high_error_rate',
    severity: 'critical',
    check: (data) => typeof data.successRate === 'number' && data.successRate < 0.8, // <80% success
    describe: (data) => `High error rate: ${((1 - Number(data.successRate)) * 100).toFixed(1)}% failures`,
  },
  {
    type: 'high_token_usage',
    severity: 'warning',
    check: (data) => typeof data.avgOutputTokens === 'number' && data.avgOutputTokens > 50_000,
    describe: (data) => `High token usage: avg ${data.avgOutputTokens} output tokens`,
  },
];

export class AnomalyDetector {
  async detect(): Promise<number> {
    const db = getDatabase();
    const now = new Date();
    const since1h = new Date(now.getTime() - 60 * 60 * 1000);

    // Get recent snapshots
    const snapshots = await db
      .select()
      .from(instancePerfSnapshots)
      .where(gte(instancePerfSnapshots.bucketStart, since1h));

    let newEvents = 0;

    for (const snapshot of snapshots) {
      const data = snapshot as unknown as Record<string, unknown>;
      for (const rule of rules) {
        if (rule.check(data)) {
          // Check if similar event already exists (dedup)
          const existing = await db
            .select()
            .from(anomalyEvents)
            .where(
              and(
                eq(anomalyEvents.type, rule.type),
                eq(anomalyEvents.instanceId, snapshot.instanceId),
                eq(anomalyEvents.resolved, false)
              )
            )
            .limit(1);

          if (existing.length === 0) {
            await db.insert(anomalyEvents).values({
              type: rule.type,
              severity: rule.severity,
              providerName: snapshot.providerName,
              modelName: snapshot.instanceName,
              instanceId: snapshot.instanceId,
              description: rule.describe(data),
              details: data,
            });
            newEvents++;
          }
        }
      }
    }

    return newEvents;
  }

  async getUnresolved(): Promise<AnomalyEvent[]> {
    const db = getDatabase();
    return db
      .select()
      .from(anomalyEvents)
      .where(eq(anomalyEvents.resolved, false))
      .orderBy(desc(anomalyEvents.createdAt));
  }

  async getAll(limit = 100): Promise<AnomalyEvent[]> {
    const db = getDatabase();
    return db
      .select()
      .from(anomalyEvents)
      .orderBy(desc(anomalyEvents.createdAt))
      .limit(limit);
  }

  async resolve(id: string): Promise<void> {
    const db = getDatabase();
    await db
      .update(anomalyEvents)
      .set({
        resolved: true,
        resolvedAt: new Date(),
      })
      .where(eq(anomalyEvents.id, id));
  }
}

export type { AnomalyEvent } from '@xartifact/x-llm-gateway-db';
export { anomalyEvents } from '@xartifact/x-llm-gateway-db';
