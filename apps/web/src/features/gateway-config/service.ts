/**
 * 网关配置服务
 * 支持动态配置，带内存缓存
 */

import { eq } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';

import { gatewayConfigs } from './db';

// 内存缓存
const configCache = new Map<string, unknown>();
let cacheInitialized = false;

/**
 * 获取配置值（带缓存）
 */
export async function getConfig<T>(key: string, defaultValue: T): Promise<T> {
  // 如果缓存已初始化且存在该配置，直接返回
  if (cacheInitialized && configCache.has(key)) {
    return configCache.get(key) as T;
  }

  // 从数据库读取
  const db = getDatabase();
  const result = await db
    .select({ value: gatewayConfigs.value })
    .from(gatewayConfigs)
    .where(eq(gatewayConfigs.key, key))
    .limit(1);

  if (result.length > 0) {
    const value = result[0].value as T;
    configCache.set(key, value);
    return value;
  }

  // 返回默认值
  return defaultValue;
}

/**
 * 设置配置值（更新缓存和数据库）
 */
export async function setConfig<T>(key: string, value: T, description?: string): Promise<void> {
  const db = getDatabase();

  // 更新或插入配置
  const existing = await db
    .select({ id: gatewayConfigs.id })
    .from(gatewayConfigs)
    .where(eq(gatewayConfigs.key, key))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(gatewayConfigs)
      .set({
        value: value as any,
        description,
        updatedAt: new Date(),
      })
      .where(eq(gatewayConfigs.id, existing[0].id));
  } else {
    await db.insert(gatewayConfigs).values({
      key,
      value: value as any,
      description,
    });
  }

  // 更新缓存
  configCache.set(key, value);

  logger.info({ key, value }, 'Config updated');
}

/**
 * 清除配置缓存
 */
export function clearConfigCache(): void {
  configCache.clear();
  cacheInitialized = false;
  logger.info('Config cache cleared');
}

/**
 * 初始化配置缓存
 */
export async function initConfigCache(): Promise<void> {
  const db = getDatabase();
  const configs = await db.select().from(gatewayConfigs);

  for (const config of configs) {
    configCache.set(config.key, config.value);
  }

  cacheInitialized = true;
  logger.info({ count: configs.length }, 'Config cache initialized');
}

/**
 * 获取所有配置
 */
export async function getAllConfigs(): Promise<Record<string, unknown>> {
  const db = getDatabase();
  const configs = await db.select().from(gatewayConfigs);

  const result: Record<string, unknown> = {};
  for (const config of configs) {
    result[config.key] = config.value;
  }

  return result;
}
