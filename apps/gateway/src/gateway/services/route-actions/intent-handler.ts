import type { RouteAction } from '@xartifact/x-herald-shared'
import { resolveIntentRoute, type IntentResult } from '../intent-router'
import { recordIntentDecision } from '../../../features/logs/services/intent-log-service'
import { NoAvailableInstanceError } from '../router-selector'
import type { RouteResult } from '../router-selector'
import { toIntentLogRouteId } from './support'
import { routeActionHandlerRegistry } from './registry'
import type { RouteActionHandler, RouteActionResolutionContext } from './types'

/**
 * 把 intent 分类结果落库。横跨 handler 的多个 return 路径（targetActions 成功 /
 * targetActions 失败 / 直连组），抽出来避免 22 个字段重复三遍。
 *
 * targetGroupId 语义：
 *   - 直连组路径（resolveGroupCandidates）→ intent.groupId 就是最终 group
 *   - targetActions 子路由路径 → intent.groupId 是 resolveIntentRoute 算出的
 *     "悲观兜底"（因为编译器只把 targetGroupIds 里的 category 转成 groupId，
 *     fallback-chain category 会落到 defaultGroupId / 第一个 key）。
 *     真正被路由到的是子 action 解析出的 candidates[0].group —— 用 actualGroupId
 *     覆盖，否则 intent_logs 会误记成兜底组（历史上所有 复杂任务 都显示 MiniMax-M3，
 *     实际已路由到 Deepseek-v4-flash）。
 */
function recordIntentResult(
  intent: IntentResult,
  ctx: RouteActionResolutionContext,
  actualGroupId?: string,
): void {
  recordIntentDecision({
    requestGroupId: ctx.routingContext.requestGroupId,
    virtualKeyId: ctx.routingContext.virtualKeyId,
    accessModelId: ctx.am.id,
    accessModelName: ctx.am.name,
    modelRouteId: toIntentLogRouteId(ctx.ruleMatch.id),
    modelRouteName: ctx.ruleMatch.name,
    modelRoutePriority: ctx.ruleMatch.priority,
    intentName: intent.intentName,
    intentSource: intent.source,
    intentConfidence: intent.confidence ?? null,
    classifierCategory: intent.classifierCategory ?? null,
    targetGroupId: actualGroupId ?? intent.groupId,
    classifierLatencyMs: intent.classifierLatencyMs ?? null,
    classifierRawResponse: intent.classifierRawResponse ?? null,
    classifierProviderId: intent.classifierProviderId ?? null,
    classifierProviderName: intent.classifierProviderName ?? null,
    classifierModelName: intent.classifierModelName ?? null,
    classifierPromptVersion: intent.classifierPromptVersion ?? null,
    userMessageRaw: intent.userMessageRaw ?? null,
    userMessage: intent.userMessage ?? null,
    userMessageCapabilities: intent.userMessageCapabilities ?? [],
    classifierSystemPrompt: intent.classifierSystemPrompt ?? null,
    classifierReasoning: intent.classifierReasoning ?? null,
    classifierRequestMessages: intent.classifierRequestMessages ?? null,
    classifierRequestBody: intent.classifierRequestBody ?? null,
    classifierResponseBody: intent.classifierResponseBody ?? null,
    classifierStatusCode: intent.classifierStatusCode ?? null,
  })
}

function attachIntentMetadata(
  candidates: RouteResult[],
  intent: IntentResult,
  ctx: RouteActionResolutionContext,
): RouteResult[] {
  return candidates.map((r) => ({
    ...r,
    mapping: ctx.mapping,
    matchedRule: {
      id: ctx.ruleMatch.id,
      name: ctx.ruleMatch.name,
      priority: ctx.ruleMatch.priority,
      conditions: ctx.ruleMatch.conditions,
    },
    intentName: intent.intentName,
    intentSource: intent.source,
    // 意图路由决策依据：用户消息 + 分类器原始响应/置信度/模型，供 routing-trace 展示
    intentTrace: {
      intentName: intent.intentName,
      intentSource: intent.source,
      confidence: intent.confidence,
      userMessage: intent.userMessage,
      capabilities: intent.userMessageCapabilities,
      classifierCategory: intent.classifierCategory,
      classifierRawResponse: intent.classifierRawResponse,
      classifierModelName: intent.classifierModelName,
      classifierLatencyMs: intent.classifierLatencyMs,
      classifierStatusCode: intent.classifierStatusCode,
    },
  }))
}

export class IntentActionHandler implements RouteActionHandler {
  readonly type = 'intent' as const

  async resolve(action: RouteAction, ctx: RouteActionResolutionContext): Promise<RouteResult[]> {
    if (!action.intentConfig || !ctx.routingContext.request) {
      throw new NoAvailableInstanceError(
        ctx.am.name,
        `intent action missing intentConfig or request body (rule '${ctx.ruleMatch.name}')`,
        ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
          outcome: 'all_failed',
        }),
      )
    }

    const intentResult = await resolveIntentRoute(
      ctx.routingContext.request,
      { requestId: ctx.routingContext.virtualKeyId },
      action.intentConfig,
    )
    const ic = action.intentConfig

    // 路由目标解析优先级（由编译器同时填好两侧，按类型分流）：
    //   1. targetActions[cat]      → 递归执行 RouteAction（支持降级链/嵌套 intent）
    //   2. defaultAction           → 递归执行 RouteAction
    //   3. targetGroupIds[cat]     → resolveGroupCandidates 直连组
    //   4. defaultGroupId          → resolveGroupCandidates
    //   5. （兜底：路由配置里第一个 groupId，行为与历史一致）
    const matchedAction: RouteAction | undefined =
      ic.targetActions?.[intentResult.intentName] ??
      (intentResult.intentName === 'default' ? ic.defaultAction : undefined)

    if (matchedAction) {
      const subHandler = routeActionHandlerRegistry.get(matchedAction.type)
      if (!subHandler) {
        recordIntentResult(intentResult, ctx)
        throw new NoAvailableInstanceError(
          ctx.am.name,
          `intent target action has unhandled type '${matchedAction.type}' (rule '${ctx.ruleMatch.name}')`,
          ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
            outcome: 'all_failed',
            failedStep: {
              actionType: 'intent',
              resolvedGroupId: intentResult.groupId,
              intentName: intentResult.intentName,
              intentSource: intentResult.source,
            },
          }),
        )
      }
      try {
        const subCandidates = await subHandler.resolve(matchedAction, ctx)
        recordIntentResult(intentResult, ctx, subCandidates[0]?.group.id)
        return attachIntentMetadata(subCandidates, intentResult, ctx)
      } catch (err) {
        // 子 action 抛错前先把 intent 分类结果落库（便于回放 "分类器说 X →
        // 实际目标失败" 的完整链路），再原样上抛。
        recordIntentResult(intentResult, ctx)
        throw err
      }
    }

    // targetGroupIds / defaultGroupId 路径（直连组）
    const candidates = await ctx.deps.resolveGroupCandidates(
      intentResult.groupId,
      ctx.routingContext,
      () =>
        ctx.deps.buildFailureSnapshot(ctx.routingContext, ctx.am, ctx.ruleMatch, {
          outcome: 'all_failed',
          failedStep: {
            actionType: 'intent',
            resolvedGroupId: intentResult.groupId,
            intentName: intentResult.intentName,
            intentSource: intentResult.source,
          },
        }),
    )
    recordIntentResult(intentResult, ctx, candidates[0]?.group.id)
    return attachIntentMetadata(candidates, intentResult, ctx)
  }
}
