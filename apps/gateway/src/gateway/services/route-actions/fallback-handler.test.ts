import { describe, it, expect, beforeEach } from 'bun:test'
import { FallbackActionHandler } from './fallback-handler'
import { registerDefaultRouteActionHandlers } from './index'
import { NoAvailableInstanceError, NoSuitableInstanceError } from '../router-selector'
import type { RouteAction } from '@xartifact/x-herald-shared'
import type { RouteActionResolutionContext } from './types'
import type { RouteChainSnapshot } from '../routing-trace-recorder'

const handler = new FallbackActionHandler()

beforeEach(() => {
  // 单例 registry 需要 route_to_group handler 才能解析主备腿；
  // 它只依赖 ctx.deps.resolveGroupCandidates（测试中按腿 stub 抛错/返回）。
  registerDefaultRouteActionHandlers()
})
function fallbackAction(primary: RouteAction, backup: RouteAction): RouteAction {
  return { type: 'fallback', primary, backup } as unknown as RouteAction
}

function createContext(overrides: {
  /** groupId -> 该组解析结果：返回候选数组，或抛错（模拟零候选失败） */
  primaryResolve?: () => Promise<unknown>
  backupResolve?: () => Promise<unknown>
}) {
  const routingContext = {
    requestedModel: 'Plan',
    streaming: true,
    hasTools: true,
    hasVision: true,
    virtualKeyId: 'vk1',
    request: { model: 'Plan', messages: [{ role: 'user', content: 'hi' }] },
  } as RouteActionResolutionContext['routingContext']

  const primaryAction = {
    type: 'route_to_group',
    targetId: 'group-deepseek',
  } as unknown as RouteAction
  const backupAction = {
    type: 'route_to_group',
    targetId: 'group-minimax',
  } as unknown as RouteAction

  let builtFailureSnapshot: RouteChainSnapshot | undefined
  const ctx = {
    routingContext,
    am: { id: 'am1', name: 'Plan', displayName: null },
    mapping: {} as never,
    ruleMatch: { id: 'rule1', name: '降级链', priority: 1, conditions: [] },
    deps: {
      // 真实链路：model-group-router 的零候选异常经 resolveGroupCandidates ��抛，
      // route_to_group handler 原样传播 → resolveSoft 捕获。这里按腿分别 stub 抛错。
      resolveGroupCandidates: async (groupId: string) => {
        if (groupId === 'group-deepseek' && overrides.primaryResolve) {
          return await overrides.primaryResolve()
        }
        if (groupId === 'group-minimax' && overrides.backupResolve) {
          return await overrides.backupResolve()
        }
        throw new Error(`unexpected groupId: ${groupId}`)
      },
      buildFailureSnapshot: (
        _rctx: unknown,
        _am: unknown,
        _rule: unknown,
        opts: {
          outcome: 'rejected' | 'all_failed'
          failedStep?: unknown
        },
      ) => {
        builtFailureSnapshot = {
          requestedModel: 'Plan',
          chain: opts.failedStep
            ? [
                {
                  index: 0,
                  kind: 'single' as const,
                  ...(opts.failedStep as object),
                  candidates: [],
                },
              ]
            : [],
          outcome: opts.outcome,
        }
        return builtFailureSnapshot
      },
      routeToInstance: async () => ({}) as never,
    },
  } as unknown as RouteActionResolutionContext

  return {
    ctx,
    primaryAction,
    backupAction,
    getFailureSnapshot: () => builtFailureSnapshot,
  }
}

describe('FallbackActionHandler leg-failure propagation', () => {
  it('throws with leg error messages + filteredOut reasons when both legs fail', async () => {
    const { ctx, primaryAction, backupAction, getFailureSnapshot } = createContext({
      primaryResolve: async () => {
        throw new NoSuitableInstanceError(
          'Deepseek-v4-flash',
          "All instances filtered out for model group 'Deepseek-v4-flash': deepseek-v4-flash (vision not supported), DeepSeek-V4-Flash-0731 (vision not supported)",
          undefined,
          [
            { instanceName: 'deepseek-v4-flash', reason: 'vision not supported' },
            { instanceName: 'DeepSeek-V4-Flash-0731', reason: 'vision not supported' },
          ],
        )
      },
      backupResolve: async () => {
        throw new NoSuitableInstanceError(
          'MiniMax-M3',
          "All instances filtered out for model group 'MiniMax-M3': MiniMax-M3 (circuit breaker open)",
          undefined,
          [{ instanceName: 'MiniMax-M3', reason: 'circuit breaker open' }],
        )
      },
    })

    try {
      await handler.resolve(fallbackAction(primaryAction, backupAction), ctx)
      expect.unreachable('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(NoAvailableInstanceError)
      const step = getFailureSnapshot()!.chain[0] as {
        decisionReason?: string
        filteredOut?: Array<{ instanceName: string; reason: string }>
      }
      expect(step.decisionReason).toContain('主链失败')
      expect(step.decisionReason).toContain('vision not supported')
      expect(step.decisionReason).toContain('备链失败')
      expect(step.decisionReason).toContain('circuit breaker open')
      expect(step.filteredOut).toEqual([
        { instanceName: 'deepseek-v4-flash', reason: 'vision not supported' },
        { instanceName: 'DeepSeek-V4-Flash-0731', reason: 'vision not supported' },
        { instanceName: 'MiniMax-M3', reason: 'circuit breaker open' },
      ])
    }
  })

  it('returns primary candidates when primary leg succeeds despite backup failure', async () => {
    const primaryCandidate = { instance: { id: 'i1' }, provider: { id: 'p1' } }
    const { ctx, primaryAction, backupAction } = createContext({
      primaryResolve: async () => [primaryCandidate],
      backupResolve: async () => {
        throw new NoSuitableInstanceError('MiniMax-M3', 'down', undefined, [
          { instanceName: 'MiniMax-M3', reason: 'circuit breaker open' },
        ])
      },
    })

    const result = await handler.resolve(fallbackAction(primaryAction, backupAction), ctx)
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ ...primaryCandidate, chainStep: 'primary' })
  })
})
