/**
 * 接入模型路由器
 * 通过规则引擎将接入模型请求路由到模型组或模型实例
 */

import { eq, and, sql } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import { fetchPerfContext } from '@/features/metrics/services/perf-context-fetcher';
import { accessModels, modelInstances, modelGroups, modelRoutes } from '@/features/model-groups/db';
import { providers } from '@/features/providers/db';
import { CATCHALL_VM_NAME } from '@/features/access-models/constants';


import { modelGroupRouter, RequestRejectedError, type RouteResult, type RoutingContext } from './model-group-router';
import type { ModelMappingResult } from './model-mapping';
import { routeRuleEngine } from './route-rule-engine';

export class AccessModelRouter {
  /**
   * 通过规则引擎路由接入模型请求，返回按策略排序的所有候选实例
   * 第一个为首选，其余为故障转移备选；空数组表示无可用路由
   */
  async routeCandidates(context: RoutingContext): Promise<RouteResult[]> {
    const db = getDatabase();

    const amResult = await db
      .select()
      .from(accessModels)
      .where(and(eq(accessModels.name, context.requestedModel), eq(accessModels.enabled, true)))
      .limit(1);

    if (amResult.length === 0) {
      return this.routeCandidatesViaDefault(context);
    }

    const am = amResult[0];

    const perf = await this.fetchAmPerfContext(am.id);
    const ruleMatch = await routeRuleEngine.match(am.id, {
      model: context.requestedModel,
      streaming: context.streaming,
      perf,
    });

    if (!ruleMatch) return [];

    const action = ruleMatch.action;
    const mappingResult: ModelMappingResult = {
      modelName: am.name,
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
        { accessModel: am.name, targetGroupId: action.targetId },
        'Route rule target group returned no candidates'
      );
      return [];
    }

    if (action.type === 'route_to_instance' && action.targetId) {
      const result = await this.routeToInstance(action.targetId, am, context, mappingResult, ruleMatch);
      return result ? [result] : [];
    }

    return [];
  }

  /**
   * 通过规则引擎路由接入模型请求（返回首选实例）
   * 如需故障转移请使用 routeCandidates
   */
  async route(context: RoutingContext): Promise<RouteResult | null> {
    const candidates = await this.routeCandidates(context);
    return candidates[0] ?? null;
  }

  /**
   * 兜底路由：当找不到接入模型时，使用 __catchall__ 接入模型处理请求
   */
  private async routeCandidatesViaDefault(context: RoutingContext): Promise<RouteResult[]> {
    const db = getDatabase();

    const defaultAmResult = await db
      .select()
      .from(accessModels)
      .where(and(eq(accessModels.name, CATCHALL_VM_NAME), eq(accessModels.enabled, true)))
      .limit(1);

    if (defaultAmResult.length === 0) return [];

    const defaultAm = defaultAmResult[0];

    const perf = await this.fetchAmPerfContext(defaultAm.id);
    const ruleMatch = await routeRuleEngine.match(defaultAm.id, {
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
      throw new RequestRejectedError(action.reason ?? `Rejected by default access model rule '${ruleMatch.name}'`);
    }

    if (action.type === 'fallback') return [];

    if (action.type === 'route_to_group' && action.targetId) {
      const candidates = await modelGroupRouter.routeCandidatesByGroupId(action.targetId, context);
      if (candidates.length > 0) {
        logger.info(
          { requestedModel: context.requestedModel, defaultAm: defaultAm.name },
          'Request routed via default access model fallback'
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
        { name: defaultAm.name, displayName: defaultAm.displayName },
        context,
        fallbackMapping,
        ruleMatch
      );
      return result ? [result] : [];
    }

    return [];
  }

  /**
   * 获取接入模型的性能上下文（用于路由条件判断）
   * 收集该 AM 所有 route_to_group 规则的目标 groupId，查询最近性能快照
   */
  private async fetchAmPerfContext(amId: string): ReturnType<typeof fetchPerfContext> {
    const db = getDatabase();
    const rules = await db
      .select({ action: modelRoutes.action })
      .from(modelRoutes)
      .where(
        and(
          sql`${modelRoutes.accessModelIds} @> ARRAY[${amId}]::text[]`,
          eq(modelRoutes.enabled, true)
        )
      );

    const groupIds = rules
      .filter((r) => r.action.type === 'route_to_group' && r.action.targetId)
      .map((r) => r.action.targetId as string);

    return fetchPerfContext(amId, groupIds);
  }

  /**
   * 直接路由到指定模型实例
   */
  private async routeToInstance(
    instanceId: string,
    am: { name: string; displayName: string | null },
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
        { accessModel: am.name, targetInstanceId: instanceId },
        'Access model rule target instance not available'
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
      id: 'access',
      name: am.name,
      displayName: am.displayName || am.name,
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
        reason: `Access model '${am.name}' → instance '${instance.name}'`,
        candidates: 1,
        responseTime: 0,
      },
      mapping: mappingResult,
      matchedRule: ruleMatch,
    };
  }
}

export const accessModelRouter = new AccessModelRouter();

/** @deprecated Use `accessModelRouter` */
export const virtualModelRouter = accessModelRouter;
