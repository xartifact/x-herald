/**
 * 系统内置数据初始化
 * 幂等操作，每次启动时执行，已存在则跳过
 */

import { eq } from 'drizzle-orm';

import logger from '@/core/lib/logger';
import { virtualModels, modelRoutes } from '@/features/model-groups/db';

import { getDatabase } from './client';

// 系统保留的内置虚拟模型名称
export const CATCHALL_VM_NAME = '__catchall__';

/**
 * 初始化系统内置数据
 */
export async function seedSystemData(): Promise<void> {
  const db = getDatabase();

  // 1. 确保 __catchall__ 虚拟模型存在
  const existing = await db
    .select({ id: virtualModels.id })
    .from(virtualModels)
    .where(eq(virtualModels.name, CATCHALL_VM_NAME))
    .limit(1);

  let catchallId: string;

  if (existing.length > 0) {
    catchallId = existing[0].id;
  } else {
    // 先清除其他可能的 isDefault，再插入
    await db.update(virtualModels).set({ isDefault: false }).where(eq(virtualModels.isDefault, true));

    const [created] = await db
      .insert(virtualModels)
      .values({
        name: CATCHALL_VM_NAME,
        displayName: '全局路由',
        description: '系统内置虚拟模型，处理所有未匹配的请求',
        isDefault: true,
        enabled: true,
      })
      .returning({ id: virtualModels.id });

    catchallId = created.id;
    logger.info({ id: catchallId }, 'System __catchall__ virtual model created');
  }

  // 2. 确保 __catchall__ 有兜底路由规则
  const existingRule = await db
    .select({ id: modelRoutes.id })
    .from(modelRoutes)
    .where(eq(modelRoutes.virtualModelId, catchallId))
    .limit(1);

  if (existingRule.length === 0) {
    await db.insert(modelRoutes).values({
      name: '全局路由规则',
      description: '系统内置兜底规则，未配置时拒绝未知模型请求',
      virtualModelId: catchallId,
      conditions: [],
      action: {
        type: 'reject',
        reason: '未找到对应的模型路由配置，请在管理面板中配置路由规则',
      },
      priority: 9999,
      enabled: true,
    });
    logger.info({ catchallId }, 'System __catchall__ default route rule created');
  }
}
