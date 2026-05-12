import { desc, eq, gte, sql, and, count, max } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import { authMiddleware } from '@/features/auth/middleware';
import { circuitBreakerRegistry } from '@/features/gateway/services/circuit-breaker';

import { circuitBreakerEvents } from './db';

const circuitBreakerRoutes = new Hono();

circuitBreakerRoutes.use('*', authMiddleware);

// 统计数据
circuitBreakerRoutes.get('/stats', async (c) => {
  const db = getDatabase();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [todayOpened, weekOpened, topInstances, trippedCount] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(circuitBreakerEvents)
      .where(and(eq(circuitBreakerEvents.event, 'opened'), gte(circuitBreakerEvents.createdAt, todayStart)))
      .then((r) => r[0].count),

    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(circuitBreakerEvents)
      .where(and(eq(circuitBreakerEvents.event, 'opened'), gte(circuitBreakerEvents.createdAt, weekStart)))
      .then((r) => r[0].count),

    db
      .select({
        instanceId: circuitBreakerEvents.instanceId,
        instanceName: circuitBreakerEvents.instanceName,
        groupName: circuitBreakerEvents.groupName,
        providerName: circuitBreakerEvents.providerName,
        openCount: sql<number>`count(*)`.mapWith(Number),
        lastOpenedAt: sql<string>`max(${circuitBreakerEvents.createdAt})`,
        tripCount: sql<number>`max(${circuitBreakerEvents.tripCount})`.mapWith(Number),
      })
      .from(circuitBreakerEvents)
      .where(eq(circuitBreakerEvents.event, 'opened'))
      .groupBy(
        circuitBreakerEvents.instanceId,
        circuitBreakerEvents.instanceName,
        circuitBreakerEvents.groupName,
        circuitBreakerEvents.providerName,
      )
      .orderBy(desc(sql`count(*)`))
      .limit(10),

    db
      .select({ count: sql<number>`count(distinct ${circuitBreakerEvents.instanceId})`.mapWith(Number) })
      .from(circuitBreakerEvents)
      .where(and(eq(circuitBreakerEvents.event, 'opened'), gte(circuitBreakerEvents.tripCount, 1)))
      .then((r) => r[0].count),
  ]);

  return c.json({ success: true, data: { todayOpened, weekOpened, trippedInstanceCount: trippedCount, topInstances } });
});

// 事件列表（分页）
circuitBreakerRoutes.get('/events', async (c) => {
  const db = getDatabase();
  const limit = Math.min(parseInt(c.req.query('limit') ?? '50', 10), 200);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);
  const instanceId = c.req.query('instanceId');
  const event = c.req.query('event') as 'opened' | 'half_open' | 'closed' | undefined;

  const conditions = [];
  if (instanceId) conditions.push(eq(circuitBreakerEvents.instanceId, instanceId));
  if (event) conditions.push(eq(circuitBreakerEvents.event, event));

  const [events, total] = await Promise.all([
    db
      .select()
      .from(circuitBreakerEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(circuitBreakerEvents.createdAt))
      .limit(limit)
      .offset(offset),

    db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(circuitBreakerEvents)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .then((r) => r[0].count),
  ]);

  return c.json({ success: true, data: { events, total, limit, offset } });
});

export default circuitBreakerRoutes;

// 实时状态
circuitBreakerRoutes.get('/realtime-states', async (_c) => {
  const instances = circuitBreakerRegistry.getAllStates();
  return _c.json({ success: true, data: { instances } });
});

// 手动重置熔断
circuitBreakerRoutes.post('/:instanceId/reset', async (c) => {
  const instanceId = c.req.param('instanceId');
  circuitBreakerRegistry.manualReset(instanceId);
  return c.json({ success: true, data: { instanceId, action: 'reset' } });
});

// 手动强制熔断
circuitBreakerRoutes.post('/:instanceId/trip', async (c) => {
  const instanceId = c.req.param('instanceId');
  const body = await c.req.json().catch(() => ({}));
  circuitBreakerRegistry.manualTrip(instanceId, body.meta);
  return c.json({ success: true, data: { instanceId, action: 'trip' } });
});
