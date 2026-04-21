import { Hono } from 'hono';

import rootLogger from '@/core/lib/logger';
import { authMiddleware } from '@/features/auth/middleware';

const logger = rootLogger.child({ module: 'settings' });

const settingsRoutes = new Hono();

settingsRoutes.use('*', authMiddleware);

settingsRoutes.get('/', async (c) => {
  try {
    return c.json({ success: true, data: {} });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get settings');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default settingsRoutes;
