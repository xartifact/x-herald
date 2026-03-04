/**
 * 模型映射服务
 * 实现三级匹配策略：精确匹配 → 别名匹配 → 默认模型组 fallback
 */

import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/core/db/client';
import { modelGroups, virtualModels } from '@/features/model-groups/db';
import type { ModelGroup } from '@/features/model-groups/types';
import { getModelMappingConfig } from '@/features/gateway-config';
import logger from '@/core/lib/logger';

export interface ModelMappingResult {
  modelName: string;        // 映射后的模型名称
  isMapped: boolean;        // 是否发生了映射
  originalModel: string;    // 原始请求的模型名称
  mappingType: 'virtual' | 'exact' | 'alias' | 'fallback' | null;
}

/**
 * 模型映射服务
 */
export class ModelMappingService {
  /**
   * 解析模型名称，支持三级匹配
   */
  async resolveModel(
    requestedModel: string,
    _virtualKeyId?: string
  ): Promise<ModelMappingResult> {
    // 1. 从数据库读取映射配置（支持动态更新）
    const mappingConfig = await getModelMappingConfig();

    // 2. 检查映射功能是否启用
    if (!mappingConfig.enabled) {
      return {
        modelName: requestedModel,
        isMapped: false,
        originalModel: requestedModel,
        mappingType: null,
      };
    }

    const db = getDatabase();

    // Level 0: Virtual Model 匹配（仅处理有 modelGroupId 的旧模式）
    // 新模式（有 modelMappings）由 VirtualModelRouter 在 chat-completion-handler 中先处理
    const virtualMatch = await db
      .select({
        virtualModelName: virtualModels.name,
        modelGroupId: virtualModels.modelGroupId,
        modelGroupName: modelGroups.name,
      })
      .from(virtualModels)
      .leftJoin(modelGroups, eq(virtualModels.modelGroupId, modelGroups.id))
      .where(
        and(
          eq(virtualModels.name, requestedModel),
          eq(virtualModels.enabled, true)
        )
      )
      .limit(1);

    if (virtualMatch.length > 0 && virtualMatch[0].modelGroupId && virtualMatch[0].modelGroupName) {
      const resolved = virtualMatch[0].modelGroupName;
      if (resolved !== requestedModel) {
        logger.info(
          { originalModel: requestedModel, resolvedModel: resolved, type: 'virtual' },
          'Model resolved via virtual model'
        );
      }
      return {
        modelName: resolved,
        isMapped: resolved !== requestedModel,
        originalModel: requestedModel,
        mappingType: 'virtual',
      };
    }

    // 如果虚拟模型匹配了但没有 modelGroupId（纯新模式），跳过继续后面的匹配
    if (virtualMatch.length > 0 && !virtualMatch[0].modelGroupId) {
      // 新模式虚拟模型应该已被 VirtualModelRouter 处理
      // 走到这里说明 VirtualModelRouter 返回了 null（无映射），继续后续匹配
    }

    // 2. 精确匹配
    const exactMatch = await db
      .select()
      .from(modelGroups)
      .where(eq(modelGroups.name, requestedModel))
      .limit(1);

    if (exactMatch.length > 0) {
      // 精确匹配成功（不输出日志，因为这是最常见的情况）
      return {
        modelName: requestedModel,
        isMapped: false,
        originalModel: requestedModel,
        mappingType: 'exact',
      };
    }

    // 3. 别名匹配
    const allGroups = await db
      .select()
      .from(modelGroups)
      .where(eq(modelGroups.enabled, true));

    const aliasMatch = allGroups.find((g) => {
      // 优先检查独立的 aliases 字段
      if (g.aliases?.includes(requestedModel)) {
        return true;
      }
      // 兼容旧数据：检查 metadata.aliases
      const metadataAliases = g.metadata?.aliases as string[] | undefined;
      return metadataAliases?.includes(requestedModel);
    });

    if (aliasMatch) {
      logger.info(
        { originalModel: requestedModel, resolvedModel: aliasMatch.name, type: 'alias' },
        'Model resolved via alias match'
      );
      return {
        modelName: aliasMatch.name,
        isMapped: true,
        originalModel: requestedModel,
        mappingType: 'alias',
      };
    }

    // 4. 全局默认 fallback
    if (mappingConfig.defaultModelGroup) {
      // 验证默认模型组是否存在
      const defaultGroup = await db
        .select()
        .from(modelGroups)
        .where(eq(modelGroups.name, mappingConfig.defaultModelGroup))
        .limit(1);

      if (defaultGroup.length > 0) {
        logger.info(
          {
            originalModel: requestedModel,
            resolvedModel: mappingConfig.defaultModelGroup,
            type: 'fallback',
          },
          'Model resolved via fallback to default model group'
        );
        return {
          modelName: mappingConfig.defaultModelGroup,
          isMapped: true,
          originalModel: requestedModel,
          mappingType: 'fallback',
        };
      }

      // 默认模型组配置存在但数据库中不存在
      logger.warn(
        {
          defaultModelGroup: mappingConfig.defaultModelGroup,
          originalModel: requestedModel,
        },
        'Default model group configured but not found in database'
      );
    }

    // 5. 未找到任何匹配，返回原始模型名（后续会抛出 ModelNotFoundError）
    // 已移除：无匹配 debug 日志，减少日志噪音
    return {
      modelName: requestedModel,
      isMapped: false,
      originalModel: requestedModel,
      mappingType: null,
    };
  }

  /**
   * 验证默认模型组配置是否有效
   * 在服务启动时调用
   */
  async validateDefaultModelGroup(): Promise<boolean> {
    const mappingConfig = await getModelMappingConfig();

    if (!mappingConfig.enabled) {
      logger.info('Model mapping is disabled');
      return true;
    }

    if (!mappingConfig.defaultModelGroup) {
      logger.warn('Model mapping is enabled but defaultModelGroup is not configured');
      return false;
    }

    const db = getDatabase();
    const defaultGroup = await db
      .select()
      .from(modelGroups)
      .where(eq(modelGroups.name, mappingConfig.defaultModelGroup))
      .limit(1);

    if (defaultGroup.length === 0) {
      throw new Error(
        `Default model group '${mappingConfig.defaultModelGroup}' is configured but not found in database. ` +
        'Please create the model group or update the configuration.'
      );
    }

    if (!defaultGroup[0].enabled) {
      throw new Error(
        `Default model group '${mappingConfig.defaultModelGroup}' is disabled. ` +
        'Please enable it or choose a different default model group.'
      );
    }

    logger.info(
      { defaultModelGroup: mappingConfig.defaultModelGroup },
      'Default model group validated successfully'
    );
    return true;
  }
}

// 单例实例
export const modelMappingService = new ModelMappingService();
