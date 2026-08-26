/**
 * route-actions 的公共协作函数 —— 从 AccessModelRouter 私有方法原样搬出，
 * 改为显式参数的自由函数，供各 RouteActionHandler 通过 RouteActionDeps 注入使用。
 */

import { and, eq, isNull } from '@xartifact/x-herald-db'
import {
  modelInstances,
  modelGroups,
  modelGroupMemberships,
  providers,
} from '@xartifact/x-herald-db'

import { getDatabase } from '../../../db/client'
import { modelGroupRouter } from '../model-group-router'
import {
  buildSelectionReason,
  ModelDisabledError,
  ModelNotFoundError,
  NoAvailableInstanceError,
  NoSuitableInstanceError,
} from '../router-selector'
import type { RouteResult, RoutingContext } from '../router-selector'
import type { ModelMappingResult } from '../model-mapping'
import type { RouteMatcher } from '../route-rule-compiler'
import {
  buildRouteChainSnapshot,
  type FailedStepInfo,
  type RouteChainSnapshot,
} from '../routing-trace-recorder'
import type { RouteCondition } from '@xartifact/x-herald-shared'
import type { LegacyRuleMatch } from './types'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * fallback 单条腿解析失败的可诊断信息。
 *
 * 设计背景：FallbackActionHandler 的 resolveSoft() 把主备腿的异常折叠成 []
 * （"都失败才整体抛 NoAvailableInstanceError"），导致路由追踪只能看到
 * `fallback, candidates: []`——"为什么两条腿都空"被吞掉了。这里保留每条腿
 * 的失败原因（组名 + 具体错误 + 组内被过滤实例），失败快照即可展示完整链路。
 */
export interface LegFailure {
  /** 该腿的类型（route_to_group / route_to_instance / intent / capability ...） */
  actionType: string
  /** 该腿解析时命中的目标组 */
  resolvedGroupId?: string
  resolvedGroupName?: string
  /** 底层错误消息（如 "All instances filtered out ...: vision not supported"） */
  errorMessage: string
  /** 组内被能力/熔断/状态过滤掉的实例及原因（零候选时才有） */
  filteredOut?: Array<{ instanceName: string; reason: string }>
}

/**
 * intent_logs.model_route_id 是 uuid 列，语义上指向（已废弃的）model_routes 表的行。
 * canvas 原生创建的规则叶子 id 形如 `fallback-new-<uuid>`，剥离类型前缀后剩下
 * `new-<uuid>`，不是合法 uuid —— 直接传进去会让 INSERT 报
 * `invalid input syntax for type uuid`，recordIntentDecision 整条静默失败。
 * 只有从 model_routes 迁移来的规则（叶子 id 本身就是那行的 uuid）才能安全传入。
 */
export function toIntentLogRouteId(legacyId: string): string | undefined {
  return UUID_RE.test(legacyId) ? legacyId : undefined
}

export function toLegacyRule(m: RouteMatcher | null): LegacyRuleMatch | null {
  if (!m) return null
  return {
    id: m.id.replace(/^(target|intent|capability|reject|fallback)-/, ''),
    name: m.routeName,
    priority: m.priority,
    action: m.action,
    conditions: m.conditions,
  }
}

/**
 * 路由在产出任何候选之前就失败时，构造一份 routeChain 快照附到抛出的错误上，
 * 让 routing-traces 也能覆盖 reject / 无可用实例 这些"没有候选"的请求链路，
 * 而不是只有成功路由的请求才留痕迹。
 */
export function buildFailureSnapshot(
  context: RoutingContext,
  am: { id?: string; name: string } | undefined,
  ruleMatch:
    | { id: string; name: string; priority: number; conditions?: RouteCondition[] }
    | null
    | undefined,
  opts: { outcome: 'rejected' | 'all_failed'; failedStep?: FailedStepInfo },
): RouteChainSnapshot {
  return buildRouteChainSnapshot(
    [],
    context.requestedModel,
    am?.id ? { id: am.id, name: am.name } : undefined,
    ruleMatch
      ? {
          id: ruleMatch.id,
          name: ruleMatch.name,
          priority: ruleMatch.priority,
          conditions: ruleMatch.conditions,
        }
      : undefined,
    opts,
  )
}

/**
 * modelGroupRouter.routeCandidatesByGroupId() 从不返回空数组 —— 组不存在/被禁用/
 * 无可用实例/全被过滤掉这几种情况都是直接 throw（ModelNotFoundError /
 * ModelDisabledError / NoAvailableInstanceError / NoSuitableInstanceError），
 * 不会走到调用方 `if (candidates.length > 0)` 之后的分支。
 * 这里补一层：捕获这类"零候选"异常后事后补上 routeChain 再重新抛出，
 * 否则 route_to_group / intent / capability 命中了空模型组时，
 * 路由追踪永远拿不到这个决策——因为异常在 access-model-router.ts 自己的
 * NoAvailableInstanceError 检查之前就已经从 model-group-router.ts 抛出了。
 */
export async function resolveGroupCandidates(
  groupId: string,
  context: RoutingContext,
  buildChain: () => RouteChainSnapshot,
): Promise<RouteResult[]> {
  try {
    return await modelGroupRouter.routeCandidatesByGroupId(groupId, context)
  } catch (err) {
    if (
      err instanceof ModelNotFoundError ||
      err instanceof ModelDisabledError ||
      err instanceof NoAvailableInstanceError ||
      err instanceof NoSuitableInstanceError
    ) {
      err.routeChain = buildChain()
    }
    throw err
  }
}

/**
 * 直接路由到指定模型实例
 */
export async function routeToInstance(
  instanceId: string,
  am: { name: string; displayName?: string | null },
  context: RoutingContext,
  mappingResult: ModelMappingResult,
  ruleMatch?: { id: string; name: string; priority: number; conditions?: RouteCondition[] },
): Promise<RouteResult> {
  const db = getDatabase()

  const instanceResult = await db
    .select({ instance: modelInstances, provider: providers })
    .from(modelInstances)
    .innerJoin(providers, eq(modelInstances.providerId, providers.id))
    .where(
      and(
        eq(modelInstances.id, instanceId),
        eq(modelInstances.enabled, true),
        isNull(modelInstances.deletedAt),
        eq(providers.enabled, true),
        isNull(providers.deletedAt),
      ),
    )
    .limit(1)

  if (instanceResult.length === 0) {
    throw new NoAvailableInstanceError(
      am.name,
      `Target instance not available for access model '${am.name}' (instance or its provider may be disabled)`,
      buildFailureSnapshot(context, { name: am.name }, ruleMatch, {
        outcome: 'all_failed',
        failedStep: { actionType: 'route_to_instance', resolvedGroupId: instanceId },
      }),
    )
  }

  const { instance, provider } = instanceResult[0]

  let group = null
  const membershipResult = await db
    .select({ groupId: modelGroupMemberships.groupId })
    .from(modelGroupMemberships)
    .where(eq(modelGroupMemberships.instanceId, instance.id))
    .limit(1)
  if (membershipResult.length > 0) {
    const groupResult = await db
      .select()
      .from(modelGroups)
      .where(and(eq(modelGroups.id, membershipResult[0].groupId), isNull(modelGroups.deletedAt)))
      .limit(1)
    group = groupResult[0] || null
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
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  // 文案经 buildSelectionReason 统一（直接路由无组内排序，idx 恒为 0）
  return {
    instance,
    provider,
    group: resolvedGroup,
    decision: {
      strategy: 'direct',
      reason: buildSelectionReason(
        'direct',
        { instance, provider, group: resolvedGroup },
        0,
        undefined,
      ),
      candidates: 1,
      responseTime: 0,
    },
    mapping: mappingResult,
    matchedRule: ruleMatch,
  }
}
