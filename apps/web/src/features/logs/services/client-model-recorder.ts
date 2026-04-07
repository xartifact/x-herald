import { eq, sql } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';

import { clientRequestedModels } from '../db';

/**
 * 记录客户端请求的模型名称
 * 如果模型名称已存在，则更新计数和最后访问时间
 * @param modelName 客户端请求的模型名称
 */
export async function recordClientRequestedModel(modelName: string): Promise<void> {
  if (!modelName || modelName.trim() === '') {
    return;
  }

  const db = getDatabase();
  const normalizedName = modelName.trim();

  try {
    // 使用 upsert：如果存在则更新，不存在则插入
    await db
      .insert(clientRequestedModels)
      .values({
        modelName: normalizedName,
        requestCount: 1,
      })
      .onConflictDoUpdate({
        target: clientRequestedModels.modelName,
        set: {
          requestCount: sql`${clientRequestedModels.requestCount} + 1`,
          lastSeenAt: new Date(),
        },
      });

    logger.debug({ modelName: normalizedName }, 'Client requested model recorded');
  } catch (error) {
    // 记录错误但不影响主流程
    logger.error({ error, modelName: normalizedName }, 'Failed to record client requested model');
  }
}

/**
 * 批量记录客户端请求的模型名称
 * @param modelNames 模型名称数组
 */
export async function recordClientRequestedModels(modelNames: string[]): Promise<void> {
  // 去重并过滤空值
  const uniqueNames = [...new Set(modelNames.filter(name => name && name.trim() !== ''))];
  
  // 串行处理，避免并发冲突
  for (const modelName of uniqueNames) {
    await recordClientRequestedModel(modelName);
  }
}
