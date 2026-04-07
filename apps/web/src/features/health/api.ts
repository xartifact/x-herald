import { sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';

const health = new Hono();

// Basic health check
health.get('/', async (c) => {
  try {
    // Test database connection
    const db = getDatabase();
    await db.execute(sql`SELECT 1`);

    return c.json({
      status: 'healthy',
      version: process.env.APP_VERSION || 'dev',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: 'connected',
    });
  } catch (error) {
    return c.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      503
    );
  }
});

// Readiness check
health.get('/ready', async (c) => {
  try {
    const db = getDatabase();
    await db.execute(sql`SELECT 1`);

    return c.json({
      status: 'ready',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return c.json(
      {
        status: 'not_ready',
        timestamp: new Date().toISOString(),
      },
      503
    );
  }
});

// Liveness check
health.get('/live', (c) => {
  return c.json({
    status: 'alive',
    timestamp: new Date().toISOString(),
  });
});

export default health;
