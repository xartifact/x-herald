/**
 * 虚拟模型路由器
 * 通过规则引擎将虚拟模型请求路由到模型组或模型实例
 */

import { eq, and } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import logger from '@/core/lib/logger';
import { virtualModels, modelInstances, modelGroups } from '@/features/model-groups/db';
import { providers } from '@/features/providers/db';

import { modelGroupRouter, type RouteResult, type RoutingContext } from './model-group-router';
import type { ModelMappingResult } from './model-mapping';
import { routeRuleEngine } from './route-rule-engine';

/**
 * 虚拟模型路由器
 */
export class VirtualModelRouter {
  /**
   * 通过规则引擎路由虚拟模型请求
   * 返回 null 表示未找到匹配的虚拟模型或无规则命中
   */
  async route(context: RoutingContext): Promise<RouteResult | null> {
    const db = getDatabase();

    // 1. 查找匹配的虚拟模型
    const vmResult = await db
      .select()
      .from(virtualModels)
      .where(
        and(
          eq(virtualModels.name, context.requestedModel),
          eq(virtualModels.enabled, true)
        )
      )
      .limit(1);

    if (vmResult.length === 0) {
      return this.routeToDefaultVirtualModel(context);
    }

    const vm = vmResult[0];

    // 2. 规则引擎匹配
    const ruleMatch = await routeRuleEngine.match(vm.id, {
      model: context.requestedModel,
      streaming: context.streaming,
    });

    if (!ruleMatch) {
      return null;
    }

    const action = ruleMatch.action;
    const mappingResult: ModelMappingResult = {
      modelName: vm.name,
      isMapped: true,
      originalModel: context.requestedModel,
      mappingType: 'virtual',
    };

    if (action.type === 'reject') {
      throw new Error(action.reason || `Request rejected by route rule '${ruleMatch.name}'`);
    }

    if (action.type === 'fallback') {
      return null;
    }

    if (action.type === 'route_to_group' && action.targetId) {
      const result = await modelGroupRouter.routeByGroupId(action.targetId, context);
      if (result) {
        return {
          ...result,
          mapping: mappingResult,
          matchedRule: { id: ruleMatch.id, name: ruleMatch.name, priority: ruleMatch.priority },
        };
      }
      logger.warn(
        { virtualModel: vm.name, targetGroupId: action.targetId },
        'Route rule target group returned no result'
      );
      return null;
    }

    if (action.type === 'route_to_instance' && action.targetId) {
      return this.routeToInstance(action.targetId, vm, context, mappingResult, ruleMatch);
    }

    return null;
  }

  /**
   * 兜底路由：当找不到虚拟模型时，使用标记为 isDefault 的虚拟模型处理请求
   */
  private async routeToDefaultVirtualModel(context: RoutingContext): Promise<RouteResult | null> {
    const db = getDatabase();

    const defaultVmResult = await db
      .select()
      .from(virtualModels)
      .where(and(eq(virtualModels.isDefault, true), eq(virtualModels.enabled, true)))
      .limit(1);

    if (defaultVmResult.length === 0) {
      return null;
    }

    const defaultVm = defaultVmResult[0];

    const ruleMatch = await routeRuleEngine.match(defaultVm.id, {
      model: context.requestedModel,
      streaming: context.streaming,
    });

    if (!ruleMatch) {
      return null;
    }

    const fallbackMapping: ModelMappingResult = {
      modelName: context.requestedModel,
      isMapped: false,
      originalModel: context.requestedModel,
      mappingType: 'fallback',
    };

    const action = ruleMatch.action;

    if (action.type === 'reject') {
      throw new Error(action.reason ?? `Rejected by default virtual model rule '${ruleMatch.name}'`);
    }

    if (action.type === 'fallback') {
      return null;
    }

    if (action.type === 'route_to_group' && action.targetId) {
      const result = await modelGroupRouter.routeByGroupId(action.targetId, context);
      if (result) {
        logger.info(
          { requestedModel: context.requestedModel, defaultVm: defaultVm.name, groupId: action.targetId },
          'Request routed via default virtual model fallback'
        );
        return {
          ...result,
          mapping: fallbackMapping,
          matchedRule: { id: ruleMatch.id, name: ruleMatch.name, priority: ruleMatch.priority },
        };
      }
      return null;
    }

    if (action.type === 'route_to_instance' && action.targetId) {
      return this.routeToInstance(
        action.targetId,
        { name: defaultVm.name, displayName: defaultVm.displayName },
        context,
        fallbackMapping,
        ruleMatch
      );
    }

    return null;
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
      .select({
        instance: modelInstances,
        provider: providers,
      })
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

    // 查找实例所属的模型组
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
