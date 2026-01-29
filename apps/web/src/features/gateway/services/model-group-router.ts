/**
 * 模型组路由器
 * 实现从虚拟模型名称到具体模型实例的智能路由
 */

import { eq, and, desc, asc } from 'drizzle-orm';
import { getDatabase } from '@/core/db/client';
import { modelGroups, modelInstances } from '@/features/model-groups/db';
import { providers } from '@/features/providers/db';
import type {
  ModelGroup,
  ModelInstance,
  ModelGroupRoutingConfig,
  RoutingStrategy,
} from '@/features/model-groups/types';
import logger from '@/core/lib/logger';

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
    strategy: RoutingStrategy;
    reason: string;
    candidates: number;
    latency?: number;
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

// 实例得分 (用于智能路由)
interface InstanceScore {
  instance: ModelInstance;
  provider: typeof providers.$inferSelect;
  group: ModelGroup;
  score: number;
  latency?: number;
  cost?: number;
}

/**
 * 模型组路由器
 */
export class ModelGroupRouter {
  private roundRobinIndex = new Map<string, number>();

  /**
   * 路由请求到具体的模型实例
   */
  async route(context: RoutingContext): Promise<RouteResult> {
    const startTime = Date.now();
    const db = getDatabase();

    // 1. 查找模型组
    const group = await this.findModelGroup(context.requestedModel);
    if (!group) {
      throw new ModelNotFoundError(context.requestedModel);
    }

    if (!group.enabled) {
      throw new ModelDisabledError(context.requestedModel);
    }

    // 2. 获取所有可用的模型实例
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

    if (instances.length === 0) {
      throw new NoAvailableInstanceError(context.requestedModel);
    }

    // 3. 过滤满足条件的实例
    const candidates = this.filterCandidates(instances, context, group);

    if (candidates.length === 0) {
      throw new NoSuitableInstanceError(context.requestedModel);
    }

    // 4. 根据策略选择实例
    const strategy = group.routingConfig?.strategy || 'round_robin';
    const selected = await this.selectByStrategy(candidates, strategy, group.routingConfig);

    const latency = Date.now() - startTime;

    logger.info(
      {
        model: context.requestedModel,
        strategy,
        selectedProvider: selected.provider.name,
        actualModel: selected.instance.actualModelName,
        candidates: candidates.length,
        latency,
      },
      'Model routed'
    );

    return {
      instance: selected.instance,
      provider: selected.provider,
      group,
      decision: {
        strategy,
        reason: selected.reason,
        candidates: candidates.length,
        latency,
      },
    };
  }

  /**
   * 查找模型组
   */
  private async findModelGroup(name: string): Promise<ModelGroup | null> {
    const db = getDatabase();

    // 先按精确名称查找
    const exactMatch = await db
      .select()
      .from(modelGroups)
      .where(eq(modelGroups.name, name))
      .limit(1);

    if (exactMatch.length > 0) {
      return exactMatch[0];
    }

    // 尝试按别名查找 (metadata.aliases)
    const withAlias = await db
      .select()
      .from(modelGroups)
      .where(eq(modelGroups.enabled, true));

    return withAlias.find((g) => {
      const aliases = g.metadata?.aliases as string[] | undefined;
      return aliases?.includes(name);
    }) || null;
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
   * 根据策略选择实例
   */
  private async selectByStrategy(
    candidates: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup }>,
    strategy: RoutingStrategy,
    config?: ModelGroupRoutingConfig
  ): Promise<{ instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup; reason: string }> {
    switch (strategy) {
      case 'round_robin':
        return this.roundRobin(candidates, config);

      case 'weighted':
        return this.weighted(candidates, config);

      case 'priority':
        return this.priority(candidates);

      case 'least_latency':
        return this.leastLatency(candidates);

      case 'cost_optimized':
        return this.costOptimized(candidates, config);

      case 'smart':
        return this.smart(candidates, config);

      default:
        return this.roundRobin(candidates, config);
    }
  }

  /**
   * 轮询策略
   */
  private roundRobin(
    candidates: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup }>,
    config?: ModelGroupRoutingConfig
  ): { instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup; reason: string } {
    const groupId = candidates[0].group.id;
    const current = this.roundRobinIndex.get(groupId) || 0;
    const index = current % candidates.length;

    this.roundRobinIndex.set(groupId, index + 1);

    return {
      ...candidates[index],
      reason: `Round robin selection (index: ${index})`,
    };
  }

  /**
   * 权重策略
   */
  private weighted(
    candidates: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup }>,
    config?: ModelGroupRoutingConfig
  ): { instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup; reason: string } {
    const weights = candidates.map((c) => c.instance.weight);
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (let i = 0; i < candidates.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        return {
          ...candidates[i],
          reason: `Weighted selection (weight: ${weights[i]}/${totalWeight})`,
        };
      }
    }

    return {
      ...candidates[candidates.length - 1],
      reason: 'Weighted selection (fallback)',
    };
  }

  /**
   * 优先级策略
   */
  private priority(
    candidates: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup }>
  ): { instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup; reason: string } {
    const sorted = [...candidates].sort((a, b) => a.instance.priority - b.instance.priority);
    return {
      ...sorted[0],
      reason: `Priority selection (priority: ${sorted[0].instance.priority})`,
    };
  }

  /**
   * 最少延迟策略
   */
  private leastLatency(
    candidates: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup }>
  ): { instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup; reason: string } {
    // 这里可以根据历史延迟数据排序
    // 简化实现：优先选择最近检查过的健康实例
    const sorted = [...candidates].sort((a, b) => {
      const aTime = a.instance.lastCheckedAt?.getTime() || 0;
      const bTime = b.instance.lastCheckedAt?.getTime() || 0;
      return bTime - aTime;
    });

    return {
      ...sorted[0],
      reason: 'Least latency (recently checked)',
    };
  }

  /**
   * 成本优化策略
   */
  private costOptimized(
    candidates: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup }>,
    config?: ModelGroupRoutingConfig
  ): { instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup; reason: string } {
    const withCost = candidates
      .filter((c) => c.instance.costPer1kTokens)
      .sort((a, b) => {
        const aCost = (a.instance.costPer1kTokens?.input || 0) + (a.instance.costPer1kTokens?.output || 0);
        const bCost = (b.instance.costPer1kTokens?.input || 0) + (b.instance.costPer1kTokens?.output || 0);
        return aCost - bCost;
      });

    if (withCost.length > 0) {
      const cost = withCost[0].instance.costPer1kTokens;
      return {
        ...withCost[0],
        reason: `Cost optimized ($${cost?.input}/$${cost?.output} per 1K tokens)`,
      };
    }

    return this.weighted(candidates, config);
  }

  /**
   * 智能路由策略
   */
  private smart(
    candidates: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup }>,
    config?: ModelGroupRoutingConfig
  ): { instance: ModelInstance; provider: typeof providers.$inferSelect; group: ModelGroup; reason: string } {
    // 综合评分：健康状态 + 权重 + 成本 + 延迟
    const scores: InstanceScore[] = candidates.map((c) => {
      let score = 0;
      let reasons: string[] = [];

      // 健康状态加分
      if (c.instance.status === 'healthy') {
        score += 30;
        reasons.push('healthy');
      }

      // 权重加分 (归一化到 0-20)
      score += (c.instance.weight / 100) * 20;
      reasons.push(`weight:${c.instance.weight}`);

      // 优先级加分 (优先级 0 最高)
      score += Math.max(0, 10 - c.instance.priority);
      reasons.push(`priority:${c.instance.priority}`);

      // 成本加分 (如果知道成本)
      if (c.instance.costPer1kTokens) {
        const avgCost = (c.instance.costPer1kTokens.input + c.instance.costPer1kTokens.output) / 2;
        // 成本越低分越高 (假设成本范围 0-0.1)
        score += Math.max(0, 20 - avgCost * 200);
        reasons.push(`cost:${avgCost.toFixed(4)}`);
      }

      return {
        ...c,
        score,
      };
    });

    const best = scores.sort((a, b) => b.score - a.score)[0];

    return {
      instance: best.instance,
      provider: best.provider,
      group: best.group,
      reason: `Smart selection (score: ${best.score.toFixed(2)})`,
    };
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
