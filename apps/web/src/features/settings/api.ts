import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import rootLogger from '@/core/lib/logger';
import { authMiddleware } from '@/features/auth/middleware';
import { modelGroups, modelInstances } from '@/features/model-groups/db';
import { getConfig, setConfig } from '@/features/gateway-config/service';

const logger = rootLogger.child({ module: 'settings' });

export const CONFIG_KEY_DEFAULT_ANALYSIS_MODEL = 'DEFAULT_ANALYSIS_MODEL_GROUP_ID';

const settingsRoutes = new Hono();

settingsRoutes.use('*', authMiddleware);

settingsRoutes.get('/', async (c) => {
  try {
    const db = getDatabase();

    const [defaultGroupId, groups] = await Promise.all([
      getConfig<string | null>(CONFIG_KEY_DEFAULT_ANALYSIS_MODEL, null),
      db
        .select({
          id: modelGroups.id,
          name: modelGroups.name,
          displayName: modelGroups.displayName,
          instanceCount: sql<number>`count(${modelInstances.id})`.mapWith(Number),
        })
        .from(modelGroups)
        .leftJoin(
          modelInstances,
          eq(modelInstances.groupId, modelGroups.id)
        )
        .groupBy(modelGroups.id, modelGroups.name, modelGroups.displayName)
        .orderBy(modelGroups.name),
    ]);

    return c.json({
      success: true,
      data: {
        defaultAnalysisModelGroupId: defaultGroupId,
        availableModelGroups: groups,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get settings');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

settingsRoutes.put('/', async (c) => {
  try {
    const body = await c.req.json() as { defaultAnalysisModelGroupId?: string | null };

    if ('defaultAnalysisModelGroupId' in body) {
      const id = body.defaultAnalysisModelGroupId ?? null;

      if (id !== null) {
        const db = getDatabase();
        const exists = await db
          .select({ id: modelGroups.id })
          .from(modelGroups)
          .where(eq(modelGroups.id, id))
          .limit(1);

        if (exists.length === 0) {
          return c.json({ success: false, error: 'Model group not found' }, 404);
        }
      }

      await setConfig(
        CONFIG_KEY_DEFAULT_ANALYSIS_MODEL,
        id,
        '系统 AI 调用（如日志分析）使用的默认模型组'
      );
    }

    return c.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update settings');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default settingsRoutes;
