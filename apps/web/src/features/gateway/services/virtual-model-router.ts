/**
 * 虚拟模型路由器
 * 通过规则引擎将虚拟模型请求路由到模型组或模型实例
 */

import { eq, and, sql } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import { virtualModels, modelInstances, modelGroups, modelRoutes } from '@/features/model-groups/db';
import { providers } from '@/features/providers/db';

import { fetchPerfContext } from '@/features/metrics/services/perf-context-fetcher';

import { modelGroupRouter, RequestRejectedError, type RouteResult, type RoutingContext } from './model-group-router';
import type { ModelMappingResult } from './model-mapping';
import { routeRuleEngine } from './route-rule-engine';

/**
 * 虚拟模型路由器
 */
export class VirtualModelRouter {
  /**
   * 通过规则引擎路由虚拟模型请求，返回按策略排序的所有候选实例
   * 第一个为首选，其余为故障转移备选；空数组表示无可用路由
   */
  async routeCandidates(context: RoutingContext): Promise<RouteResult[]> {
    const db = getDatabase();

    const vmResult = await db
      .select()
      .from(virtualModels)
      .where(and(eq(virtualModels.name, context.requestedModel), eq(virtualModels.enabled, true)))
      .limit(1);

    if (vmResult.length === 0) {
      return this.routeCandidatesViaDefault(context);
    }

    const vm = vmResult[0];

    const perf = await this.fetchVmPerfContext(vm.id);
    const ruleMatch = await routeRuleEngine.match(vm.id, {
      model: context.requestedModel,
      streaming: context.streaming,
      perf,
    });

    if (!ruleMatch) return [];

    const action = ruleMatch.action;
    const mappingResult: ModelMappingResult = {
      modelName: vm.name,
      isMapped: true,
      originalModel: context.requestedModel,
      mappingType: 'virtual',
    };

    if (action.type === 'reject') {
      throw new RequestRejectedError(action.reason || `Request rejected by route rule '${ruleMatch.name}'`);
    }

    if (action.type === 'fallback') return [];

    if (action.type === 'route_to_group' && action.targetId) {
      const candidates = await modelGroupRouter.routeCandidatesByGroupId(action.targetId, context);
      if (candidates.length > 0) {
        return candidates.map((r) => ({
          ...r,
          mapping: mappingResult,
          matchedRule: { id: ruleMatch.id, name: ruleMatch.name, priority: ruleMatch.priority },
        }));
      }
      logger.warn(
        { virtualModel: vm.name, targetGroupId: action.targetId },
        'Route rule target group returned no candidates'
      );
      return [];
    }

    if (action.type === 'route_to_instance' && action.targetId) {
      const result = await this.routeToInstance(action.targetId, vm, context, mappingResult, ruleMatch);
      return result ? [result] : [];
    }

    return [];
  }

  /**
   * 通过规则引擎路由虚拟模型请求（返回首选实例）
   * 如需故障转移请使用 routeCandidates
   */
  async route(context: RoutingContext): Promise<RouteResult | null> {
    const candidates = await this.routeCandidates(context);
    return candidates[0] ?? null;
  }

  /**
   * 兜底路由：当找不到虚拟模型时，使用标记为 isDefault 的虚拟模型处理请求
   */
  private async routeCandidatesViaDefault(context: RoutingContext): Promise<RouteResult[]> {
    const db = getDatabase();

    const defaultVmResult = await db
      .select()
      .from(virtualModels)
      .where(and(eq(virtualModels.isDefault, true), eq(virtualModels.enabled, true)))
      .limit(1);

    if (defaultVmResult.length === 0) return [];

    const defaultVm = defaultVmResult[0];

    const perf = await this.fetchVmPerfContext(defaultVm.id);
    const ruleMatch = await routeRuleEngine.match(defaultVm.id, {
      model: context.requestedModel,
      streaming: context.streaming,
      perf,
    });

    if (!ruleMatch) return [];

    const fallbackMapping: ModelMappingResult = {
      modelName: context.requestedModel,
      isMapped: false,
      originalModel: context.requestedModel,
      mappingType: 'fallback',
    };

    const action = ruleMatch.action;

    if (action.type === 'reject') {
      throw new RequestRejectedError(action.reason ?? `Rejected by default virtual model rule '${ruleMatch.name}'`);
    }

    if (action.type === 'fallback') return [];

    if (action.type === 'route_to_group' && action.targetId) {
      const candidates = await modelGroupRouter.routeCandidatesByGroupId(action.targetId, context);
      if (candidates.length > 0) {
        logger.info(
          { requestedModel: context.requestedModel, defaultVm: defaultVm.name },
          'Request routed via default virtual model fallback'
        );
        return candidates.map((r) => ({
          ...r,
          mapping: fallbackMapping,
          matchedRule: { id: ruleMatch.id, name: ruleMatch.name, priority: ruleMatch.priority },
        }));
      }
      return [];
    }

    if (action.type === 'route_to_instance' && action.targetId) {
      const result = await this.routeToInstance(
        action.targetId,
        { name: defaultVm.name, displayName: defaultVm.displayName },
        context,
        fallbackMapping,
        ruleMatch
      );
      return result ? [result] : [];
    }

    return [];
  }

  /**
   * 获取虚拟模型的性能上下文（用于路由条件判断）
   * 收集该 VM 所有 route_to_group 规则的目标 groupId，查询最近性能快照
   */
  private async fetchVmPerfContext(vmId: string): ReturnType<typeof fetchPerfContext> {
    const db = getDatabase();
    const rules = await db
      .select({ action: modelRoutes.action })
      .from(modelRoutes)
      .where(
        and(
          sql`${modelRoutes.virtualModelIds} @> ARRAY[${vmId}]::text[]`,
          eq(modelRoutes.enabled, true)
        )
      );

    const groupIds = rules
      .filter((r) => r.action.type === 'route_to_group' && r.action.targetId)
      .map((r) => r.action.targetId as string);

    return fetchPerfContext(vmId, groupIds);
  }

  /**
   * 直接路由到指定模型实例
   */
  private async routeToInstance(
    instanceId: string,
    vm: { name: string; displayName: string | null },
    context: RoutingContext,
    mappingResult: ModelMappingResult,
    ruleMatch?: { id: string; name: string; priority: number }
  ): Promise<RouteResult | null> {
    const db = getDatabase();

    const instanceResult = await db
      .select({ instance: modelInstances, provider: providers })
      .from(modelInstances)
      .innerJoin(providers, eq(modelInstances.providerId, providers.id))
      .where(
        and(
          eq(modelInstances.id, instanceId),
          eq(modelInstances.enabled, true),
          eq(providers.enabled, true)
        )
      )
      .limit(1);

    if (instanceResult.length === 0) {
      logger.warn(
        { virtualModel: vm.name, targetInstanceId: instanceId },
        'Virtual model rule target instance not available'
      );
      return null;
    }

    const { instance, provider } = instanceResult[0];

    let group = null;
    if (instance.groupId) {
      const groupResult = await db
        .select()
        .from(modelGroups)
        .where(eq(modelGroups.id, instance.groupId))
        .limit(1);
      group = groupResult[0] || null;
    }

    const resolvedGroup = group || {
      id: 'virtual',
      name: vm.name,
      displayName: vm.displayName || vm.name,
      description: null,
      aliases: [],
      category: 'chat' as const,
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
        jsonMode: false,
        maxTokens: 4096,
        contextWindow: 128000,
      },
      supportedProtocols: ['openai'],
      enabled: true,
      routingConfig: null,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    return {
      instance,
      provider,
      group: resolvedGroup,
      decision: {
        strategy: 'direct',
        reason: `Virtual model '${vm.name}' → instance '${instance.name}'`,
        candidates: 1,
        latency: 0,
      },
      mapping: mappingResult,
      matchedRule: ruleMatch,
    };
  }
}

export const virtualModelRouter = new VirtualModelRouter();
