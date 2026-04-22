/**
 * 模型组路由器
 * 按实例 priority 升序选取第一个可用实例
 */

import { eq, and } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import { modelGroups, modelInstances } from '@/features/model-groups/db';
import type { ModelGroup, ModelInstance } from '@/features/model-groups/types';
import { providers } from '@/features/providers/db';

import type { ModelMappingResult } from './model-mapping';

// 路由结果
export interface RouteResult {
  // 选中的模型实例
  instance: ModelInstance;

  // 关联的供应商
  provider: typeof providers.$inferSelect;

  // 关联的模型组
  group: ModelGroup;

  // 路由决策信息
  decision: {
    strategy: string;
    reason: string;
    candidates: number;
    latency?: number;
  };

  // 模型映射信息
  mapping: ModelMappingResult;

  // 命中的路由规则（可选，由 VirtualModelRouter 写入）
  matchedRule?: {
    id: string;
    name: string;
    priority: number;
  };
}

// 路由上下文
export interface RoutingContext {
  // 请求特征
  requestedModel: string;
  streaming: boolean;
  hasTools: boolean;
  hasVision: boolean;

  // 用户上下文
  virtualKeyId: string;

  // 偏好设置
  preferredProvider?: string;
  maxLatency?: number;
  maxCost?: number;
}

/**
 * 模型组路由器
 */
export class ModelGroupRouter {
  /**
   * 按模型组 ID 路由（由 VirtualModelRouter 调用）
   * 组内实例按 priority 升序取第一个可用实例
   */
  async routeByGroupId(
    groupId: string,
    context: RoutingContext
  ): Promise<RouteResult | null> {
    const db = getDatabase();

    const groupResult = await db
      .select()
      .from(modelGroups)
      .where(eq(modelGroups.id, groupId))
      .limit(1);

    if (groupResult.length === 0 || !groupResult[0].enabled) {
      return null;
    }

    const group = groupResult[0];

    const instances = await db
      .select({
        instance: modelInstances,
        provider: providers,
      })
      .from(modelInstances)
      .innerJoin(providers, eq(modelInstances.providerId, providers.id))
      .where(
        and(
          eq(modelInstances.groupId, group.id),
          eq(modelInstances.enabled, true),
          eq(providers.enabled, true)
        )
      );

    if (instances.length === 0) return null;

    const candidates = this.filterCandidates(instances, context, group);
    if (candidates.length === 0) return null;

    // 按 priority 升序取第一个可用实例
    const sorted = [...candidates].sort((a, b) => a.instance.priority - b.instance.priority);
    const selected = sorted[0];

    const mappingResult: ModelMappingResult = {
      modelName: group.name,
      isMapped: true,
      originalModel: context.requestedModel,
      mappingType: 'virtual',
    };

    logger.debug(
      {
        groupId,
        selectedInstance: selected.instance.name,
        priority: selected.instance.priority,
        candidates: candidates.length,
      },
      'Instance selected by priority'
    );

    return {
      instance: selected.instance,
      provider: selected.provider,
      group,
      decision: {
        strategy: 'priority',
        reason: `Priority selection (priority: ${selected.instance.priority})`,
        candidates: candidates.length,
      },
      mapping: mappingResult,
    };
  }

  /**
   * 过滤候选实例
   */
  private filterCandidates(
    instances: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect }>,
    context: RoutingContext,
    group: ModelGroup
  ): Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup }> {
    return instances
      .filter(({ instance, provider }) => {
        // 检查实例状态
        if (instance.status === 'down') {
          return false;
        }

        // 检查能力匹配
        const capabilities = {
          ...group.capabilities,
          ...instance.config?.capabilityOverrides,
        };

        if (context.streaming && !capabilities.streaming) {
          return false;
        }

        if (context.hasTools && !capabilities.functionCalling) {
          return false;
        }

        if (context.hasVision && !capabilities.vision) {
          return false;
        }

        // 检查供应商协议配置
        const protocol = provider.protocols?.openai || provider.protocols?.anthropic;
        if (!protocol?.enabled) {
          return false;
        }

        return true;
      })
      .map(({ instance, provider }) => ({
        instance,
        provider,
        group,
      }));
  }

  /**
   * 获取模型组列表
   */
  async listModelGroups(): Promise<ModelGroup[]> {
    const db = getDatabase();
    return db.select().from(modelGroups).where(eq(modelGroups.enabled, true));
  }

  /**
   * 获取模型组详情
   */
  async getModelGroupDetail(groupId: string): Promise<{
    group: ModelGroup;
    instances: Array<{
      instance: ModelInstance;
      provider: typeof providers.$inferSelect;
    }>;
  } | null> {
    const db = getDatabase();

    const group = await db
      .select()
      .from(modelGroups)
      .where(eq(modelGroups.id, groupId))
      .limit(1);

    if (group.length === 0) return null;

    const instances = await db
      .select({
        instance: modelInstances,
        provider: providers,
      })
      .from(modelInstances)
      .innerJoin(providers, eq(modelInstances.providerId, providers.id))
      .where(eq(modelInstances.groupId, groupId));

    return {
      group: group[0],
      instances,
    };
  }
}

// ==================== 错误类 ====================

export class ModelNotFoundError extends Error {
  constructor(modelName: string) {
    super(`Model group '${modelName}' not found`);
    this.name = 'ModelNotFoundError';
  }
}

export class ModelDisabledError extends Error {
  constructor(modelName: string) {
    super(`Model group '${modelName}' is disabled`);
    this.name = 'ModelDisabledError';
  }
}

export class NoAvailableInstanceError extends Error {
  constructor(modelName: string) {
    super(`No available instances for model '${modelName}'`);
    this.name = 'NoAvailableInstanceError';
  }
}

export class NoSuitableInstanceError extends Error {
  constructor(modelName: string) {
    super(`No suitable instance found for model '${modelName}' with given constraints`);
    this.name = 'NoSuitableInstanceError';
  }
}

// 单例实例
export const modelGroupRouter = new ModelGroupRouter();
