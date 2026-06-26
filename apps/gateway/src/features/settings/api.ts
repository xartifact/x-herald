import { eq, sql } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '../../db/client';
import { rootLogger } from '../../lib';
import { CB_CONFIG_KEY, configureCircuitBreaker } from '../../gateway/services';
import { getConfig, setConfig } from '../gateway-config/service';
import { modelGroups, modelGroupMemberships } from '@x-llm-gateway/db';

const logger = rootLogger.child({ module: 'settings' });

/** @deprecated 请使用 CONFIG_KEY_AI_MODEL */
export const CONFIG_KEY_DEFAULT_ANALYSIS_MODEL = 'AI_MODEL_GROUP_ID';
export { CONFIG_KEY_AI_MODEL } from '../../lib';

const DEFAULT_CB_CONFIG = {
  failureThreshold: 3,
  openDurationMs: 60_000,
  maxBackoffMs: 300_000,
  maxTripsBeforeCooldown: 5,
  cooldownDurationMs: 1_800_000,
};

const settingsRoutes = new Hono();

settingsRoutes.get('/', async (c) => {
  try {
    const db = getDatabase();

    const [defaultGroupId, groups, cbConfig] = await Promise.all([
      getConfig<string | null>('AI_MODEL_GROUP_ID', null),
      db
        .select({
          id: modelGroups.id,
          name: modelGroups.name,
          displayName: modelGroups.displayName,
          instanceCount: sql<number>`count(DISTINCT ${modelGroupMemberships.instanceId})`.mapWith(Number),
        })
        .from(modelGroups)
        .leftJoin(modelGroupMemberships, eq(modelGroupMemberships.groupId, modelGroups.id))
        .groupBy(modelGroups.id, modelGroups.name, modelGroups.displayName)
        .orderBy(modelGroups.name),
      getConfig(CB_CONFIG_KEY, DEFAULT_CB_CONFIG),
    ]);

    return c.json({
      success: true,
      data: {
        aiModelGroupId: defaultGroupId,
        availableModelGroups: groups,
        circuitBreaker: cbConfig,
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
    const body = await c.req.json() as {
      aiModelGroupId?: string | null;
      circuitBreaker?: {
        failureThreshold: number;
        openDurationMs: number;
        maxBackoffMs?: number;
        maxTripsBeforeCooldown?: number;
        cooldownDurationMs?: number;
      };
    };

    if ('aiModelGroupId' in body) {
      const id = body.aiModelGroupId ?? null;

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

      await setConfig('AI_MODEL_GROUP_ID', id, '系统所有 AI 功能（日志分析、配置助手等）使用的模型组');
    }

    if ('circuitBreaker' in body && body.circuitBreaker) {
      const cb = body.circuitBreaker;
      const { failureThreshold, openDurationMs, maxBackoffMs, maxTripsBeforeCooldown, cooldownDurationMs } = cb;

      if (!Number.isInteger(failureThreshold) || failureThreshold < 1 || failureThreshold > 100) {
        return c.json({ success: false, error: 'failureThreshold 必须是 1-100 之间的整数' }, 400);
      }
      if (!Number.isInteger(openDurationMs) || openDurationMs < 1000 || openDurationMs > 3_600_000) {
        return c.json({ success: false, error: 'openDurationMs 必须是 1000-3600000 之间的整数' }, 400);
      }
      if (maxBackoffMs !== undefined) {
        if (!Number.isInteger(maxBackoffMs) || maxBackoffMs < 1000 || maxBackoffMs > 3_600_000) {
          return c.json({ success: false, error: 'maxBackoffMs 必须是 1000-3600000 之间的整数' }, 400);
        }
      }
      if (maxTripsBeforeCooldown !== undefined) {
        if (!Number.isInteger(maxTripsBeforeCooldown) || maxTripsBeforeCooldown < 2 || maxTripsBeforeCooldown > 20) {
          return c.json({ success: false, error: 'maxTripsBeforeCooldown 必须是 2-20 之间的整数' }, 400);
        }
      }
      if (cooldownDurationMs !== undefined) {
        if (!Number.isInteger(cooldownDurationMs) || cooldownDurationMs < 60_000 || cooldownDurationMs > 7_200_000) {
          return c.json({ success: false, error: 'cooldownDurationMs 必须是 60000-7200000 之间的整数' }, 400);
        }
      }

      const cbConfig = {
        failureThreshold,
        openDurationMs,
        ...(maxBackoffMs !== undefined && { maxBackoffMs }),
        ...(maxTripsBeforeCooldown !== undefined && { maxTripsBeforeCooldown }),
        ...(cooldownDurationMs !== undefined && { cooldownDurationMs }),
      };
      await setConfig(CB_CONFIG_KEY, cbConfig, '熔断器配置：失败阈值和熔断持续时间');
      // 立即应用到运行时（无需重启）
      configureCircuitBreaker(cbConfig);
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