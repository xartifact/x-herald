/**
 * 虚拟模型路由器
 * 支持虚拟模型多目标映射和路由策略
 */

import { eq, and } from 'drizzle-orm';
import { getDatabase } from '@/core/db/client';
import { virtualModels, modelMappings, modelInstances, modelGroups } from '@/features/model-groups/db';
import { providers } from '@/features/providers/db';
import type { RoutingStrategy } from '@/features/model-groups/db';
import logger from '@/core/lib/logger';
import { modelGroupRouter, type RouteResult, type RoutingContext } from './model-group-router';
import type { ModelMappingResult } from './model-mapping';
import { routeRuleEngine } from './route-rule-engine';

/**
 * 虚拟模型路由器
 */
export class VirtualModelRouter {
  private roundRobinIndex = new Map<string, number>();

  /**
   * 尝试通过虚拟模型的多目标映射进行路由
   * 返回 null 表示该虚拟模型没有使用新的映射模式，需 fallback 到旧路由
   */
  async route(context: RoutingContext): Promise<RouteResult | null> {
    const db = getDatabase();
    const startTime = Date.now();

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
      return null;
    }

    const vm = vmResult[0];

    // 1.5 规则引擎匹配（在映射之前）
    const ruleMatch = await routeRuleEngine.match(vm.id, {
      model: context.requestedModel,
      streaming: context.streaming,
    });

    if (ruleMatch) {
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
        return null; // 让 ModelGroupRouter 处理
      }

      if (action.type === 'route_to_group' && action.targetId) {
        const result = await modelGroupRouter.routeByGroupId(action.targetId, context);
        if (result) {
          return { ...result, mapping: mappingResult };
        }
      }

      if (action.type === 'route_to_instance' && action.targetId) {
        return this.routeToInstance(action.targetId, vm, context, mappingResult);
      }

      // route_to_virtual_model 暂不支持递归，走默认映射
    }

    // 2. 查找启用的映射
    const mappingRows = await db
      .select()
      .from(modelMappings)
      .where(
        and(
          eq(modelMappings.virtualModelId, vm.id),
          eq(modelMappings.enabled, true)
        )
      );

    // 如果没有映射，返回 null，让旧路由链继续处理
    if (mappingRows.length === 0) {
      return null;
    }

    // 3. 按策略选择一个映射目标
    const strategy = (vm.routingConfig?.strategy as RoutingStrategy) || 'round_robin';
    const selected = this.selectMapping(mappingRows, strategy, vm.id);

    // 4. 根据目标类型获取路由结果
    const mappingResult: ModelMappingResult = {
      modelName: vm.name,
      isMapped: true,
      originalModel: context.requestedModel,
      mappingType: 'virtual',
    };

    if (selected.targetType === 'model_group') {
      // 委托给 ModelGroupRouter 处理模型组路由
      const result = await modelGroupRouter.routeByGroupId(selected.targetId, context);
      if (!result) {
        logger.warn(
          { virtualModel: vm.name, targetGroupId: selected.targetId },
          'Virtual model mapping target group route failed'
        );
        return null;
      }

      const latency = Date.now() - startTime;
      return {
        ...result,
        mapping: mappingResult,
        decision: {
          ...result.decision,
          reason: `Virtual model '${vm.name}' → group '${result.group.name}' (${strategy})`,
          latency,
        },
      };
    }

    // targetType === 'model_instance' → 直接路由到实例
    return this.routeToInstance(selected.targetId, vm, context, mappingResult, {
      strategy,
      candidates: mappingRows.length,
      startTime,
    });
  }

  /**
   * 直接路由到指定模型实例
   */
  private async routeToInstance(
    instanceId: string,
    vm: { name: string; displayName: string | null },
    context: RoutingContext,
    mappingResult: ModelMappingResult,
    meta?: { strategy?: string; candidates?: number; startTime?: number }
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
        'Virtual model mapping target instance not available'
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
      routingConfig: { strategy: 'round_robin' as const, fallbackEnabled: false },
      supportedProtocols: ['openai'],
      enabled: true,
      metadata: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const strategy = (meta?.strategy || 'direct') as RoutingStrategy;
    const latency = meta?.startTime ? Date.now() - meta.startTime : 0;

    return {
      instance,
      provider,
      group: resolvedGroup,
      decision: {
        strategy,
        reason: `Virtual model '${vm.name}' → instance '${instance.name}' (${strategy})`,
        candidates: meta?.candidates ?? 1,
        latency,
      },
      mapping: mappingResult,
    };
  }

  /**
   * 在映射列表中按策略选择
   */
  private selectMapping(
    mappings: typeof modelMappings.$inferSelect[],
    strategy: RoutingStrategy,
    vmId: string
  ): typeof modelMappings.$inferSelect {
    switch (strategy) {
      case 'priority': {
        const sorted = [...mappings].sort((a, b) => a.priority - b.priority);
        return sorted[0];
      }
      case 'weighted': {
        const totalWeight = mappings.reduce((sum, m) => sum + m.weight, 0);
        let random = Math.random() * totalWeight;
        for (const m of mappings) {
          random -= m.weight;
          if (random <= 0) return m;
        }
        return mappings[mappings.length - 1];
      }
      case 'round_robin':
      default: {
        const current = this.roundRobinIndex.get(vmId) || 0;
        const index = current % mappings.length;
        this.roundRobinIndex.set(vmId, index + 1);
        return mappings[index];
      }
    }
  }
}

export const virtualModelRouter = new VirtualModelRouter();
