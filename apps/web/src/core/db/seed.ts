/**
 * 系统内置数据初始化
 *
 * 分两类操作：
 * 1. 每次启动都保证存在（系统级不变量）：__catchall__ 虚拟模型
 * 2. 仅首次启动创建（引导型，用户删除后不再重建）：全局路由规则
 *    通过 gatewayConfigs.initial_routes_seeded 标志控制
 *    flag 与路由在同一事务内原子写入，避免崩溃导致状态不一致
 */

import { eq } from 'drizzle-orm';

import logger from '@/core/lib/logger';
import { gatewayConfigs } from '@/features/gateway-config/db';
import { virtualModels, modelRoutes } from '@/features/model-groups/db';
import { CATCHALL_VM_NAME } from '@/features/virtual-models/constants';

import { getDatabase } from './client';

const SEED_FLAG_KEY = 'initial_routes_seeded';

export async function seedSystemData(): Promise<void> {
  const db = getDatabase();

  // 1. __catchall__ 虚拟模型：系统必须存在，每次启动都确保
  //    使用 ON CONFLICT DO NOTHING 原子保证，避免竞态重复插入
  const [created] = await db
    .insert(virtualModels)
    .values({
      name: CATCHALL_VM_NAME,
      displayName: '全局路由',
      description: '系统内置虚拟模型，处理所有未匹配的请求',
      enabled: true,
    })
    .onConflictDoNothing()
    .returning({ id: virtualModels.id });

  let catchallId: string;

  if (created) {
    catchallId = created.id;
    logger.info({ id: catchallId }, 'System __catchall__ virtual model created');
  } else {
    const [existing] = await db
      .select({ id: virtualModels.id })
      .from(virtualModels)
      .where(eq(virtualModels.name, CATCHALL_VM_NAME))
      .limit(1);
    catchallId = existing.id;
  }

  // 2. 默认路由规则：flag 与路由在同一事务内原子写入
  //    ON CONFLICT DO NOTHING 保证 flag 只写一次；
  //    若写入成功（returning 有值）说明是首次启动，同步创建兜底规则；
  //    若写入被跳过（returning 为空）说明已 seeded，直接返回。
  await db.transaction(async (tx) => {
    const [flagInserted] = await tx
      .insert(gatewayConfigs)
      .values({
        key: SEED_FLAG_KEY,
        value: { seededAt: new Date().toISOString() },
        description: '系统初始路由规则已完成首次创建，重启不再自动添加',
      })
      .onConflictDoNothing()
      .returning({ id: gatewayConfigs.id });

    if (!flagInserted) {
      return; // 已经 seeded 过，跳过（即使用户删了路由也不管）
    }

    await tx.insert(modelRoutes).values({
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

    logger.info({ catchallId }, 'System initial route rule created (one-time)');
  });
}
