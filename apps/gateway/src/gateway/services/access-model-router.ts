/**
 * 接入模型路由器
 * 通过规则引擎将接入模型请求路由到模型组或模型实例
 */

import { and, eq, isNull } from '@xartifact/x-herald-db'

import { getDatabase } from '../../db/client'
import logger from '../../lib/logger'
import { CATCHALL_VM_NAME } from '../../features/access-models/constants'
import { fetchPerfContext } from '../../features/metrics/services/perf-context-fetcher'
import { accessModels } from '@xartifact/x-herald-db'

import { RequestRejectedError, type RouteResult, type RoutingContext } from './model-group-router'
import { ModelNotFoundError, NoAvailableInstanceError } from './router-selector'
import type { ModelMappingResult } from './model-mapping'
import { getRouteRuleEngine } from './route-rule-engine'
import { gatewayBusinessMetrics } from '../../features/metrics/gateway-business-metrics'
import { lookupActivePotentialTarget, recordPotentialHit } from '../../features/potential-models'
import type { RouteAction } from '@xartifact/x-herald-shared'
import {
  buildFailureSnapshot,
  resolveGroupCandidates,
  routeToInstance,
  toLegacyRule,
} from './route-actions/support'
import {
  registerDefaultRouteActionHandlers,
  routeActionHandlerRegistry,
  type LegacyRuleMatch,
  type RouteActionDeps,
} from './route-actions'

registerDefaultRouteActionHandlers()

const routeActionDeps: RouteActionDeps = {
  resolveGroupCandidates,
  buildFailureSnapshot,
  routeToInstance,
}

export class AccessModelRouter {
  /**
   * 按 action.type 从 route-actions 的 handler registry 里查表分发。
   * routeCandidates() / routeCandidatesViaDefault() 各自解析出 am/mapping/ruleMatch
   * 后，唯一的共同点就是这一次查表调用——原来三处手写的 action-type 分支
   * （routeCandidates / routeCandidatesViaDefault / resolveAction）现在只有这一份。
   */
  private async dispatchAction(
    action: RouteAction,
    ctx: {
      routingContext: RoutingContext
      am: { id?: string; name: string; displayName?: string | null }
      mapping: ModelMappingResult
      ruleMatch: LegacyRuleMatch
    },
  ): Promise<RouteResult[]> {
    const handler = routeActionHandlerRegistry.get(action.type)
    if (!handler) {
      throw new NoAvailableInstanceError(
        ctx.am.name,
        `Unhandled route action type '${action.type}' (rule '${ctx.ruleMatch.name}')`,
        buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, { outcome: 'all_failed' }),
      )
    }
    return handler.resolve(action, { ...ctx, deps: routeActionDeps })
  }

  /**
   * 通过规则引擎路由接入模型请求，返回按策略排序的所有候选实例
   * 第一个为首选，其余为故障转移备选；空数组表示无可用路由
   */
  async routeCandidates(context: RoutingContext): Promise<RouteResult[]> {
    const db = getDatabase()

    const potentialTarget = await lookupActivePotentialTarget(context.requestedModel)
    if (potentialTarget) {
      logger.info(
        {
          requestedModel: context.requestedModel,
          rewrittenTo: potentialTarget.targetAccessModelName,
        },
        'Potential model routing override',
      )
      context = { ...context, requestedModel: potentialTarget.targetAccessModelName }
    }

    const amResult = await db
      .select()
      .from(accessModels)
      .where(
        and(
          eq(accessModels.name, context.requestedModel),
          eq(accessModels.enabled, true),
          isNull(accessModels.deletedAt),
        ),
      )
      .limit(1)

    if (amResult.length === 0) {
      // 没有找到已接入模型，且没有 route_to 覆盖时才记录为潜在模型
      if (!potentialTarget) {
        void recordPotentialHit(context.requestedModel, context.virtualKeyId)
      }
      return this.routeCandidatesViaDefault(context)
    }

    const am = amResult[0]

    const perf = await this.fetchAmPerfContext(am.id)
    const routeCtx = {
      model: context.requestedModel,
      streaming: context.streaming,
      perf,
    }
    const ruleMatch = toLegacyRule(await getRouteRuleEngine().match(am.id, routeCtx))

    if (!ruleMatch) {
      throw new NoAvailableInstanceError(
        context.requestedModel,
        `No matching route rule for access model '${am.name}' (requested model: '${context.requestedModel}')`,
        buildFailureSnapshot(context, am, null, { outcome: 'all_failed' }),
      )
    }

    const mappingResult: ModelMappingResult = {
      modelName: am.name,
      isMapped: true,
      originalModel: context.requestedModel,
      mappingType: 'virtual',
    }

    return this.dispatchAction(ruleMatch.action, {
      routingContext: context,
      am,
      mapping: mappingResult,
      ruleMatch,
    })
  }

  /**
   * 通过规则引擎路由接入模型请求（返回首选实例）
   * 如需故障转移请使用 routeCandidates
   */
  async route(context: RoutingContext): Promise<RouteResult | null> {
    const endTimer = gatewayBusinessMetrics.routingDuration.startTimer({
      access_model: context.requestedModel,
    })
    try {
      const candidates = await this.routeCandidates(context)
      endTimer({ result: candidates.length > 0 ? 'matched' : 'no_match' })
      return candidates[0] ?? null
    } catch (err) {
      endTimer({
        result: err instanceof RequestRejectedError ? 'rejected' : 'no_match',
      })
      throw err
    }
  }

  /**
   * 兜底路由：当找不到接入模型时，使用 __catchall__ 接入模型处理请求
   */
  private async routeCandidatesViaDefault(context: RoutingContext): Promise<RouteResult[]> {
    const db = getDatabase()

    const defaultAmResult = await db
      .select()
      .from(accessModels)
      .where(
        and(
          eq(accessModels.name, CATCHALL_VM_NAME),
          eq(accessModels.enabled, true),
          isNull(accessModels.deletedAt),
        ),
      )
      .limit(1)

    if (defaultAmResult.length === 0) {
      throw new ModelNotFoundError(
        context.requestedModel,
        `Access model '${context.requestedModel}' not found and no catchall (__catchall__) configured`,
        buildFailureSnapshot(context, undefined, null, { outcome: 'all_failed' }),
      )
    }

    const defaultAm = defaultAmResult[0]

    const perf = await this.fetchAmPerfContext(defaultAm.id)
    const ruleMatch = toLegacyRule(
      await getRouteRuleEngine().match(defaultAm.id, {
        model: context.requestedModel,
        streaming: context.streaming,
        perf,
      }),
    )

    if (!ruleMatch) {
      throw new NoAvailableInstanceError(
        context.requestedModel,
        `No matching route rule for catchall access model (requested: '${context.requestedModel}')`,
        buildFailureSnapshot(context, defaultAm, null, { outcome: 'all_failed' }),
      )
    }

    const fallbackMapping: ModelMappingResult = {
      modelName: context.requestedModel,
      isMapped: false,
      originalModel: context.requestedModel,
      mappingType: 'fallback',
    }

    return this.dispatchAction(ruleMatch.action, {
      routingContext: context,
      am: { id: defaultAm.id, name: defaultAm.name, displayName: defaultAm.displayName },
      mapping: fallbackMapping,
      ruleMatch,
    })
  }

  /**
   * 获取接入模型的性能上下文（用于路由条件判断）
   * 收集该 AM 所有 route_to_group 规则的目标 groupId，查询最近性能快照
   */
  private async fetchAmPerfContext(amId: string): ReturnType<typeof fetchPerfContext> {
    const matchers = getRouteRuleEngine().getMatchersForAccessModel(amId)
    const groupIds = new Set<string>()
    for (const m of matchers) {
      if (m.action.type === 'route_to_group' && m.action.targetId) {
        groupIds.add(m.action.targetId)
      }
    }
    return fetchPerfContext(amId, Array.from(groupIds))
  }
}

export const accessModelRouter = new AccessModelRouter()
