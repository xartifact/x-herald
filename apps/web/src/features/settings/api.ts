import { eq } from 'drizzle-orm';
import { Hono } from 'hono';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import { authMiddleware } from '@/features/auth/middleware';
import {
  getModelMappingConfig,
  setModelMappingConfig,
} from '@/features/gateway-config';
import { modelGroups } from '@/features/model-groups/db';

const settingsRoutes = new Hono();

// 应用认证中间件
settingsRoutes.use('*', authMiddleware);

/**
 * 获取系统配置
 */
settingsRoutes.get('/', async (c) => {
  try {
    const db = getDatabase();

    // 从数据库读取配置（支持动态更新，无需重启）
    const mappingConfig = await getModelMappingConfig();

    // 获取所有启用的模型组供选择
    const groups = await db
      .select({
        id: modelGroups.id,
        name: modelGroups.name,
        displayName: modelGroups.displayName,
        enabled: modelGroups.enabled,
      })
      .from(modelGroups)
      .where(eq(modelGroups.enabled, true));

    // 验证默认模型组是否存在
    const defaultGroupExists = mappingConfig.defaultModelGroup
      ? groups.some((g) => g.name === mappingConfig.defaultModelGroup)
      : false;

    return c.json({
      success: true,
      data: {
        modelMapping: {
          enabled: mappingConfig.enabled,
          defaultModelGroup: mappingConfig.defaultModelGroup,
          defaultGroupExists,
        },
        availableModelGroups: groups.map((g) => ({
          id: g.id,
          name: g.name,
          displayName: g.displayName || g.name,
        })),
      },
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get settings');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

/**
 * 更新系统配置
 */
settingsRoutes.put('/', async (c) => {
  try {
    const data = await c.req.json();
    const db = getDatabase();

    // 验证默认模型组是否存在
    if (data.modelMapping?.defaultModelGroup) {
      const group = await db
        .select()
        .from(modelGroups)
        .where(eq(modelGroups.name, data.modelMapping.defaultModelGroup))
        .limit(1);

      if (group.length === 0) {
        return c.json(
          { success: false, error: 'Default model group not found' },
          400
        );
      }

      if (!group[0].enabled) {
        return c.json(
          { success: false, error: 'Default model group is disabled' },
          400
        );
      }
    }

    // 更新数据库配置（立即生效，无需重启）
    await setModelMappingConfig({
      enabled: data.modelMapping.enabled,
      defaultModelGroup: data.modelMapping.defaultModelGroup || '',
    });

    logger.info({ updates: data.modelMapping }, 'Settings updated');

    return c.json({
      success: true,
      message: 'Settings updated successfully. Changes are effective immediately.',
      data: data.modelMapping,
    });
  } catch (error) {
    logger.error({ error }, 'Failed to update settings');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500
    );
  }
});

export default settingsRoutes;
