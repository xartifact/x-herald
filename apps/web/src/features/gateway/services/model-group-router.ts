/**
 * 模型组路由器
 * 支持 priority、round_robin、weighted 路由策略，集成熔断器
 */

import { eq, and, asc } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import {
  fetchGroupInstancesPerf,
  type InstancePerfData,
} from '@/features/metrics/services/instance-perf-cache';
import { modelGroups, modelInstances } from '@/features/model-groups/db';
import type { ModelGroup, ModelInstance } from '@/features/model-groups/types';
import { providers } from '@/features/providers/db';

import { circuitBreakerRegistry } from './circuit-breaker';
import type { ModelMappingResult } from './model-mapping';

// 路由结果
export interface RouteResult {
  instance: ModelInstance;
  provider: typeof providers.$inferSelect;
  group: ModelGroup;
  decision: {
    strategy: string;
    reason: string;
    candidates: number;
    responseTime?: number;
  };
  mapping: ModelMappingResult;
  matchedRule?: {
    id: string;
    name: string;
    priority: number;
  };
  perf?: InstancePerfData;
}

// 路由上下文
export interface RoutingContext {
  requestedModel: string;
  streaming: boolean;
  hasTools: boolean;
  hasVision: boolean;
  virtualKeyId: string;
  preferredProvider?: string;
  maxResponseTime?: number;
  maxCost?: number;
}

type Candidate = {
  instance: ModelInstance;
  provider: typeof providers.$inferSelect;
  group: ModelGroup;
};

// 触发故障转移的状态码（服务端错误和限流），4xx 客户端错误不转移
export const FAILOVER_STATUS_CODES = new Set([429, 500, 502, 503, 504, 521, 524]);

// 轮询计数器（内存中，按 groupId）
const roundRobinCounters = new Map<string, number>();

// 平局兜底比较：priority 升序，相等时 createdAt 升序（越老越稳定）
function byPriorityThenAge(a: Candidate, b: Candidate): number {
  const pd = a.instance.priority - b.instance.priority;
  if (pd !== 0) return pd;
  return a.instance.createdAt.getTime() - b.instance.createdAt.getTime();
}

// smart 策略综合评分（满分 100）
// - 成功率：50 分权重（最重要）
// - TTFB：30 分权重（以 1500ms 为 100% 基准）
// - 重试率：15 分权重（超过 5 次重试得 0 分）
// - 成本：5 分权重（可选，成本越低越好）
function computeSmartScore(
  perf: InstancePerfData | undefined,
  instance: ModelInstance
): number {
  const successRate = perf?.successRate ?? 0.85;
  const ttfbAvg = perf?.ttfbAvg;
  const avgRetryCount = perf?.avgRetryCount ?? 0;
  const cost = instance.costPer1kTokens;

  const successScore = successRate * 50;
  const ttfbScore = ttfbAvg != null ? Math.min(1, 1500 / ttfbAvg) * 30 : 15;
  const retryScore = Math.max(0, 1 - avgRetryCount / 5) * 15;
  const costScore = cost != null
    ? Math.min(1, 1 / ((cost.input + cost.output) / 2 + 0.001)) * 5
    : 2.5;

  return successScore + ttfbScore + retryScore + costScore;
}

/**
 * 模型组路由器
 */
export class ModelGroupRouter {
  /**
   * 按模型组 ID 路由，返回按策略排序的所有候选实例
   * 第一个候选为首选，其余为故障转移备选
   */
  async routeCandidatesByGroupId(
    groupId: string,
    context: RoutingContext
  ): Promise<RouteResult[]> {
    const db = getDatabase();

    const groupResult = await db
      .select()
      .from(modelGroups)
      .where(eq(modelGroups.id, groupId))
      .limit(1);

    if (groupResult.length === 0 || !groupResult[0].enabled) return [];

    const group = groupResult[0];

    const instances = await db
      .select({ instance: modelInstances, provider: providers })
      .from(modelInstances)
      .innerJoin(providers, eq(modelInstances.providerId, providers.id))
      .where(
        and(
          eq(modelInstances.groupId, group.id),
          eq(modelInstances.enabled, true),
          eq(providers.enabled, true)
        )
      )
      .orderBy(asc(modelInstances.priority), asc(modelInstances.createdAt));

    if (instances.length === 0) return [];

    const filtered = this.filterCandidates(instances, context, group);
    if (filtered.length === 0) return [];

    const strategy = group.routingConfig?.strategy ?? 'priority';
    const sorted = await this.selectByStrategy(filtered, strategy, group.id);

    // Fetch performance data for baseline TTFB timeout calculation
    const perfMap = await fetchGroupInstancesPerf(group.id);

    logger.debug(
      { groupId, strategy, totalCandidates: filtered.length },
      'Routing candidates resolved'
    );

    return sorted.map((c, idx) => ({
      instance: c.instance,
      provider: c.provider,
      group,
      decision: {
        strategy,
        reason: idx === 0
          ? `${strategy} selection (priority: ${c.instance.priority})`
          : `${strategy} failover candidate #${idx + 1}`,
        candidates: filtered.length,
      },
      mapping: {
        modelName: group.name,
        isMapped: true,
        originalModel: context.requestedModel,
        mappingType: 'virtual' as const,
      },
      perf: perfMap.get(c.instance.id),
    }));
  }

  /**
   * 按模型组 ID 路由（兼容接口）
   * 返回首选实例；如需故障转移请使用 routeCandidatesByGroupId
   */
  async routeByGroupId(
    groupId: string,
    context: RoutingContext
  ): Promise<RouteResult | null> {
    const candidates = await this.routeCandidatesByGroupId(groupId, context);
    return candidates[0] ?? null;
  }

  /**
   * 按策略对候选实例排序，返回有序列表
   * 第一个元素为本轮首选，其余为故障转移顺序
   * 平局处理：primary 相等时依次以 priority → createdAt 兜底，确保确定性顺序
   */
  private async selectByStrategy(candidates: Candidate[], strategy: string, groupId: string): Promise<Candidate[]> {
    switch (strategy) {
      case 'round_robin': {
        const sorted = [...candidates].sort(byPriorityThenAge);
        const count = roundRobinCounters.get(groupId) ?? 0;
        roundRobinCounters.set(groupId, count + 1);
        const idx = count % sorted.length;
        return [...sorted.slice(idx), ...sorted.slice(0, idx)];
      }

      case 'weighted': {
        const totalWeight = candidates.reduce((sum, c) => sum + (c.instance.weight ?? 1), 0);
        let rand = Math.random() * totalWeight;
        let selectedIdx = candidates.length - 1;
        for (let i = 0; i < candidates.length; i++) {
          rand -= (candidates[i].instance.weight ?? 1);
          if (rand <= 0) { selectedIdx = i; break; }
        }
        const rest = [...candidates.slice(0, selectedIdx), ...candidates.slice(selectedIdx + 1)]
          .sort(byPriorityThenAge);
        return [candidates[selectedIdx], ...rest];
      }

      case 'least_response_time': {
        const perfMap = await fetchGroupInstancesPerf(groupId);
        const withPerf: Array<{ c: Candidate; ttfb: number }> = [];
        const withoutPerf: Candidate[] = [];

        for (const c of candidates) {
          const ttfb = perfMap.get(c.instance.id)?.ttfbAvg;
          if (ttfb != null) {
            withPerf.push({ c, ttfb });
          } else {
            withoutPerf.push(c);
          }
        }

        withPerf.sort((a, b) => {
          if (a.ttfb !== b.ttfb) return a.ttfb - b.ttfb;
          return byPriorityThenAge(a.c, b.c);
        });
        withoutPerf.sort(byPriorityThenAge);

        return [...withPerf.map((x) => x.c), ...withoutPerf];
      }

      case 'cost_optimized': {
        const withCost: Array<{ c: Candidate; totalCost: number }> = [];
        const withoutCost: Candidate[] = [];

        for (const c of candidates) {
          const cost = c.instance.costPer1kTokens;
          if (cost != null) {
            withCost.push({ c, totalCost: cost.input + cost.output });
          } else {
            withoutCost.push(c);
          }
        }

        withCost.sort((a, b) => {
          if (a.totalCost !== b.totalCost) return a.totalCost - b.totalCost;
          return byPriorityThenAge(a.c, b.c);
        });
        withoutCost.sort(byPriorityThenAge);

        return [...withCost.map((x) => x.c), ...withoutCost];
      }

      case 'smart': {
        const perfMap = await fetchGroupInstancesPerf(groupId);
        return [...candidates]
          .map((c) => ({ c, score: computeSmartScore(perfMap.get(c.instance.id), c.instance) }))
          .sort((a, b) => {
            if (a.score !== b.score) return b.score - a.score;
            return byPriorityThenAge(a.c, b.c);
          })
          .map((x) => x.c);
      }

      case 'priority':
      default:
        return [...candidates].sort(byPriorityThenAge);
    }
  }

  /**
   * 过滤候选实例：排除熔断开路、down、能力不匹配的实例
   */
  private filterCandidates(
    instances: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect }>,
    context: RoutingContext,
    group: ModelGroup
  ): Candidate[] {
    return instances
      .filter(({ instance, provider }) => {
        // 熔断检查
        if (circuitBreakerRegistry.isOpen(instance.id)) {
          logger.debug({ instanceId: instance.id }, '[CircuitBreaker] Skipping open circuit instance');
          return false;
        }

        // 实例状态检查
        if (instance.status === 'down') return false;

        // 能力匹配
        const capabilities = {
          ...group.capabilities,
          ...instance.config?.capabilityOverrides,
        };
        if (context.streaming && !capabilities.streaming) return false;
        if (context.hasTools && !capabilities.functionCalling) return false;
        if (context.hasVision && !capabilities.vision) return false;

        // 供应商协议配置检查
        const protocol = provider.protocols?.openai || provider.protocols?.anthropic;
        if (!protocol?.enabled) return false;

        return true;
      })
      .map(({ instance, provider }) => ({ instance, provider, group }));
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
      .select({ instance: modelInstances, provider: providers })
      .from(modelInstances)
      .innerJoin(providers, eq(modelInstances.providerId, providers.id))
      .where(eq(modelInstances.groupId, groupId))
      .orderBy(asc(modelInstances.priority), asc(modelInstances.createdAt));

    return { group: group[0], instances };
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

export class RequestRejectedError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = 'RequestRejectedError';
  }
}

// 单例实例
export const modelGroupRouter = new ModelGroupRouter();
