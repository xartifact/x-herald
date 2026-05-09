/**
 * 系统内置数据初始化
 *
 * 分两类操作：
 * 1. 每次启动都保证存在（系统级不变量）：__catchall__ 虚拟模型
 * 2. 仅首次启动创建（引导型，用户删除后不再重建）：全局路由规则
 *    通过 gatewayConfigs.initial_routes_seeded 标志控制
 */

import { eq } from 'drizzle-orm';

import logger from '@/core/lib/logger';
import { gatewayConfigs } from '@/features/gateway-config/db';
import { virtualModels, modelRoutes } from '@/features/model-groups/db';

import { getDatabase } from './client';

export const CATCHALL_VM_NAME = '__catchall__';
const SEED_FLAG_KEY = 'initial_routes_seeded';

export async function seedSystemData(): Promise<void> {
  const db = getDatabase();

  // 1. __catchall__ 虚拟模型：系统必须存在，每次启动都确保
  const existing = await db
    .select({ id: virtualModels.id })
    .from(virtualModels)
    .where(eq(virtualModels.name, CATCHALL_VM_NAME))
    .limit(1);

  let catchallId: string;

  if (existing.length > 0) {
    catchallId = existing[0].id;
  } else {
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

  // 2. 默认路由规则：仅首次启动创建，用户删除后不再重建
  const seedFlag = await db
    .select({ value: gatewayConfigs.value })
    .from(gatewayConfigs)
    .where(eq(gatewayConfigs.key, SEED_FLAG_KEY))
    .limit(1);

  if (seedFlag.length > 0) {
    // 已经 seeded 过，跳过路由规则创建（即使用户删了也不管）
    return;
  }

  // 首次启动：创建兜底拒绝规则
  await db.insert(modelRoutes).values({
    name: '全局路由规则',
    description: '系统内置兜底规则，未配置时拒绝未知模型请求',
    virtualModelIds: [catchallId],
    conditions: [],
    action: {
      type: 'reject',
      reason: '未找到对应的模型路由配置，请在管理面板中配置路由规则',
    },
    priority: 9999,
    enabled: true,
  });

  // 记录标志，后续启动不再重建
  await db.insert(gatewayConfigs).values({
    key: SEED_FLAG_KEY,
    value: { seededAt: new Date().toISOString() },
    description: '系统初始路由规则已完成首次创建，重启不再自动添加',
  });

  logger.info({ catchallId }, 'System initial route rule created (one-time)');
}
