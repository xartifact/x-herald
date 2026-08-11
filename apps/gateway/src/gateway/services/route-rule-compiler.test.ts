import { describe, it, expect } from 'bun:test'

import {
  compileCanvasToMatchers,
  type ClassifierModelNameResolver,
  type RouteMatcher,
} from './route-rule-compiler'
import { evaluateConditions, type RouteContext } from './route-rule-engine'
import type { CanvasGraph } from '@xartifact/x-llm-gateway-shared'

/** 纯函数版的"按 modelName 匹配第一条满足条件的 matcher"，供测试直接断言编译结果。 */
function matchByModelName(
  matchers: RouteMatcher[],
  modelName: string,
  ctx: RouteContext,
): RouteMatcher | null {
  for (const m of matchers) {
    if (!m.accessModelNames.includes(modelName)) continue
    if (evaluateConditions(m.conditions, ctx)) return m
  }
  return null
}

function matchByVmId(
  matchers: RouteMatcher[],
  vmId: string,
  ctx: RouteContext,
): RouteMatcher | null {
  for (const m of matchers) {
    if (!m.accessModelIds.includes(vmId)) continue
    if (evaluateConditions(m.conditions, ctx)) return m
  }
  return null
}

describe('compileCanvasToMatchers', () => {
  it('空画布 → 0 matchers', async () => {
    expect(await compileCanvasToMatchers({ nodes: [], edges: [] })).toHaveLength(0)
  })

  it('modelTrigger → target（route_to_access_model）按 modelName 匹配', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'gpt-4', label: 'GPT-4' },
        },
        {
          id: 'target-1',
          type: 'target',
          position: { x: 0, y: 0 },
          data: {
            label: '接入模型',
            actionType: 'route_to_access_model',
            targetId: 'am-fallback',
            targetType: 'access_model',
            targetName: 'GPT-4 Fallback',
            ruleName: 'r1',
          },
        },
      ],
      edges: [{ id: 'e1', source: 'vm-am-1', target: 'target-1' }],
    }
    const matchers = await compileCanvasToMatchers(graph)

    const match = matchByModelName(matchers, 'gpt-4', { model: 'gpt-4', streaming: false })
    expect(match).not.toBeNull()
    expect(match?.routeName).toBe('GPT-4')
    expect(match?.action.type).toBe('route_to_access_model')
    expect(match?.action.targetId).toBe('am-fallback')
  })

  it('modelTrigger → condition(true) → target 条件链评估', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'claude-3', label: 'Claude' },
        },
        {
          id: 'cond-1',
          type: 'condition',
          position: { x: 0, y: 0 },
          data: {
            label: '条件',
            field: 'context.streaming',
            operator: 'eq',
            value: 'true',
            condIndex: 0,
          },
        },
        {
          id: 'target-1',
          type: 'target',
          position: { x: 0, y: 0 },
          data: {
            label: '实例',
            actionType: 'route_to_instance',
            targetId: 'inst-streaming',
            targetType: 'model_instance',
            targetName: 'Streaming Instance',
            ruleName: 'streaming-route',
          },
        },
      ],
      edges: [
        { id: 'e-vm-cond', source: 'vm-am-1', target: 'cond-1' },
        { id: 'e-cond-target', source: 'cond-1', sourceHandle: 'true', target: 'target-1' },
      ],
    }
    const matchers = await compileCanvasToMatchers(graph)

    const streamingCtx = { model: 'claude-3', streaming: true }
    const nonStreamingCtx = { model: 'claude-3', streaming: false }

    const streamingMatch = matchByModelName(matchers, 'claude-3', streamingCtx)
    expect(streamingMatch).not.toBeNull()
    expect(streamingMatch?.action.type).toBe('route_to_instance')

    const nonStreamingMatch = matchByModelName(matchers, 'claude-3', nonStreamingCtx)
    expect(nonStreamingMatch).toBeNull()
  })

  it('modelTrigger → reject 编译为 reject action', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'banned-model', label: 'Banned' },
        },
        {
          id: 'reject-1',
          type: 'reject',
          position: { x: 0, y: 0 },
          data: { label: '拒绝', strategyType: 'reject', reason: 'not allowed' },
        },
      ],
      edges: [{ id: 'e1', source: 'vm-am-1', target: 'reject-1' }],
    }
    const matchers = await compileCanvasToMatchers(graph)

    const match = matchByModelName(matchers, 'banned-model', {
      model: 'banned-model',
      streaming: false,
    })
    expect(match).not.toBeNull()
    expect(match?.action.type).toBe('reject')
    if (match?.action.type === 'reject') {
      expect(match.action.reason).toBe('not allowed')
    }
  })

  it('modelTrigger → fallback 主备链 编译为 fallback action', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'fallback-model', label: 'F' },
        },
        {
          id: 'fallback-1',
          type: 'fallback',
          position: { x: 0, y: 0 },
          data: { label: '降级链' },
        },
        {
          id: 'primary-t',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-primary' },
        },
        {
          id: 'backup-t',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-backup' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'fallback-1' },
        { id: 'e2', source: 'fallback-1', sourceHandle: 'handle-primary', target: 'primary-t' },
        { id: 'e3', source: 'fallback-1', sourceHandle: 'handle-backup', target: 'backup-t' },
      ],
    }
    const matchers = await compileCanvasToMatchers(graph)

    const match = matchByModelName(matchers, 'fallback-model', {
      model: 'fallback-model',
      streaming: false,
    })
    expect(match).not.toBeNull()
    expect(match?.action.type).toBe('fallback')
    if (match?.action.type === 'fallback') {
      expect(match.action.primary).toEqual({ type: 'route_to_group', targetId: 'group-primary' })
      expect(match.action.backup).toEqual({ type: 'route_to_group', targetId: 'group-backup' })
    }
  })

  it('按 vmId 匹配（兼容 mode）', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-uuid-1', modelName: 'gpt-4', label: 'GPT-4' },
        },
        {
          id: 'reject-1',
          type: 'reject',
          position: { x: 0, y: 0 },
          data: { label: '拒绝', strategyType: 'reject', reason: 'r' },
        },
      ],
      edges: [{ id: 'e1', source: 'vm-am-1', target: 'reject-1' }],
    }
    const matchers = await compileCanvasToMatchers(graph)

    const match = matchByVmId(matchers, 'am-uuid-1', { model: 'gpt-4', streaming: false })
    expect(match).not.toBeNull()
  })

  it('多个 modelTrigger → 各自独立', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'gpt-4', label: 'GPT-4' },
        },
        {
          id: 'vm-am-2',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-2', modelName: 'claude-3', label: 'Claude' },
        },
        {
          id: 'reject-1',
          type: 'reject',
          position: { x: 0, y: 0 },
          data: { label: '拒绝', strategyType: 'reject', reason: 'a' },
        },
        {
          id: 'reject-2',
          type: 'reject',
          position: { x: 0, y: 0 },
          data: { label: '拒绝', strategyType: 'reject', reason: 'b' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'reject-1' },
        { id: 'e2', source: 'vm-am-2', target: 'reject-2' },
      ],
    }
    const matchers = await compileCanvasToMatchers(graph)

    expect(matchByModelName(matchers, 'gpt-4', { model: 'gpt-4', streaming: false })).not.toBeNull()
    expect(
      matchByModelName(matchers, 'claude-3', { model: 'claude-3', streaming: false }),
    ).not.toBeNull()
    expect(matchByModelName(matchers, 'unknown', { model: 'unknown', streaming: false })).toBeNull()
  })

  it('孤立边（指向不存在节点）被静默忽略', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'gpt-4', label: 'GPT-4' },
        },
      ],
      edges: [{ id: 'e-dangling', source: 'vm-am-1', target: 'non-existent' }],
    }
    const matchers = await compileCanvasToMatchers(graph)

    expect(matchers).toHaveLength(0)
    expect(matchByModelName(matchers, 'gpt-4', { model: 'gpt-4', streaming: false })).toBeNull()
  })

  it('modelTrigger → intent 节点，targetGroupIds/defaultGroupId 从 handle-{category} 边推导', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'plan', label: 'Plan' },
        },
        {
          id: 'intent-1',
          type: 'intent',
          position: { x: 0, y: 0 },
          data: {
            label: '意图路由',
            intentConfig: {
              categories: ['coding', 'chat'],
              classifier: { providerId: 'prov-1', modelName: 'classifier-model' },
            },
          },
        },
        {
          id: 'target-coding',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-coding' },
        },
        {
          id: 'target-chat',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-chat' },
        },
        {
          id: 'target-default',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-default' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'intent-1' },
        { id: 'e2', source: 'intent-1', sourceHandle: 'handle-coding', target: 'target-coding' },
        { id: 'e3', source: 'intent-1', sourceHandle: 'handle-chat', target: 'target-chat' },
        { id: 'e4', source: 'intent-1', sourceHandle: 'handle-default', target: 'target-default' },
      ],
    }
    const matchers = await compileCanvasToMatchers(graph)

    const match = matchByModelName(matchers, 'plan', { model: 'plan', streaming: false })
    expect(match).not.toBeNull()
    expect(match?.action.type).toBe('intent')
    if (match?.action.type === 'intent') {
      expect(match.action.intentConfig).toEqual({
        targetGroupIds: { coding: 'group-coding', chat: 'group-chat' },
        defaultGroupId: 'group-default',
        classifier: {
          providerId: 'prov-1',
          modelName: 'classifier-model',
          categories: ['coding', 'chat'],
        },
      })
    }
  })

  it('modelTrigger → intent 节点，category 路由到 fallback 链时编译到 targetActions (不丢 category)', async () => {
    // 回归用例：生产环境观察到的「分类器说 复杂任务 但配置没接住」
    // 是因为编译器只把直连 target 节点的 category 加进 targetGroupIds，
    // 路由到 fallback 节点的 category 被静默丢弃。修复后这些 category
    // 进入 targetActions，运行时 intent handler 递归执行 fallback action。
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'plan', label: 'Plan' },
        },
        {
          id: 'intent-1',
          type: 'intent',
          position: { x: 0, y: 0 },
          data: {
            label: '意图路由',
            intentConfig: {
              categories: ['coding', '复杂任务'],
              classifier: { providerId: 'prov-1', modelName: 'classifier-model' },
            },
          },
        },
        {
          id: 'target-coding',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-coding' },
        },
        {
          id: 'fallback-complex',
          type: 'fallback',
          position: { x: 0, y: 0 },
          data: { reason: '' },
        },
        {
          id: 'target-primary',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-primary' },
        },
        {
          id: 'target-backup',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-backup' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'intent-1' },
        { id: 'e2', source: 'intent-1', sourceHandle: 'handle-coding', target: 'target-coding' },
        {
          id: 'e3',
          source: 'intent-1',
          sourceHandle: 'handle-复杂任务',
          target: 'fallback-complex',
        },
        {
          id: 'e4',
          source: 'fallback-complex',
          sourceHandle: 'handle-primary',
          target: 'target-primary',
        },
        {
          id: 'e5',
          source: 'fallback-complex',
          sourceHandle: 'handle-backup',
          target: 'target-backup',
        },
      ],
    }
    const matchers = await compileCanvasToMatchers(graph)

    const match = matchByModelName(matchers, 'plan', { model: 'plan', streaming: false })
    expect(match).not.toBeNull()
    expect(match?.action.type).toBe('intent')
    if (match?.action.type === 'intent') {
      const ic = match.action.intentConfig
      // coding 是直连 → 仍在 targetGroupIds
      expect(ic?.targetGroupIds).toEqual({ coding: 'group-coding' })
      // 复杂任务路由到 fallback → 进入 targetActions（关键修复点）
      expect(ic?.targetActions).toBeDefined()
      expect(ic?.targetActions?.['复杂任务']).toEqual({
        type: 'fallback',
        primary: { type: 'route_to_group', targetId: 'group-primary' },
        backup: { type: 'route_to_group', targetId: 'group-backup' },
      })
      // targetActions 和 targetGroupIds 可并存
      expect(Object.keys(ic?.targetActions ?? {}).length).toBe(1)
    }
  })

  it('modelTrigger → intent 节点，resolver 把 UUID modelName 规范化为 actual_model_name', async () => {
    // 写进 graph，导致上游 LLM 收到 UUID → 400。运行时 resolver 把 UUID
    // 解析为 actual_model_name，防御性兜底，避免脏数据引发故障。
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'plan', label: 'Plan' },
        },
        {
          id: 'intent-1',
          type: 'intent',
          position: { x: 0, y: 0 },
          data: {
            label: '意图路由',
            intentConfig: {
              categories: ['coding'],
              // 注意：这是历史上被错误保存的 UUID
              classifier: {
                providerId: 'prov-1',
                modelName: 'cee5269e-04d5-4248-8adb-eb0fdaf6e7b8',
              },
            },
          },
        },
        {
          id: 'target-coding',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-coding' },
        },
        {
          id: 'target-default',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-default' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'intent-1' },
        { id: 'e2', source: 'intent-1', sourceHandle: 'handle-coding', target: 'target-coding' },
        { id: 'e3', source: 'intent-1', sourceHandle: 'handle-default', target: 'target-default' },
      ],
    }

    const lookup = new Map<string, string>([
      ['cee5269e-04d5-4248-8adb-eb0fdaf6e7b8', 'qwythos-9b-mythos-q8'],
    ])
    const resolver: ClassifierModelNameResolver = (_providerId, modelName) =>
      lookup.get(modelName) ?? modelName

    const matchers = await compileCanvasToMatchers(graph, resolver)
    const match = matchByModelName(matchers, 'plan', { model: 'plan', streaming: false })
    expect(match?.action.type).toBe('intent')
    if (match?.action.type === 'intent') {
      expect(match.action.intentConfig?.classifier?.modelName).toBe('qwythos-9b-mythos-q8')
      expect(match.action.intentConfig?.classifier?.providerId).toBe('prov-1')
    }
  })

  it('modelTrigger → intent 节点，resolver 对 UUID 查不到时原样透传（容错）', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'plan', label: 'Plan' },
        },
        {
          id: 'intent-1',
          type: 'intent',
          position: { x: 0, y: 0 },
          data: {
            label: '意图路由',
            intentConfig: {
              categories: ['coding'],
              classifier: {
                providerId: 'prov-1',
                modelName: 'unknown-uuid-aaaa-bbbb-cccccccccccc',
              },
            },
          },
        },
        {
          id: 'target-coding',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-coding' },
        },
        {
          id: 'target-default',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-default' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'intent-1' },
        { id: 'e2', source: 'intent-1', sourceHandle: 'handle-coding', target: 'target-coding' },
        { id: 'e3', source: 'intent-1', sourceHandle: 'handle-default', target: 'target-default' },
      ],
    }

    const calls: Array<{ providerId: string; modelName: string }> = []
    const resolver: ClassifierModelNameResolver = (providerId, modelName) => {
      calls.push({ providerId, modelName })
      return modelName // 任何 UUID 都查不到，原样返回
    }

    const matchers = await compileCanvasToMatchers(graph, resolver)
    const match = matchByModelName(matchers, 'plan', { model: 'plan', streaming: false })
    expect(calls).toHaveLength(1)
    expect(calls[0]).toEqual({
      providerId: 'prov-1',
      modelName: 'unknown-uuid-aaaa-bbbb-cccccccccccc',
    })
    if (match?.action.type === 'intent') {
      expect(match.action.intentConfig?.classifier?.modelName).toBe(
        'unknown-uuid-aaaa-bbbb-cccccccccccc',
      )
    }
  })

  it('modelTrigger → intent 节点，async resolver 也能工作（DB-backed 场景）', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'plan', label: 'Plan' },
        },
        {
          id: 'intent-1',
          type: 'intent',
          position: { x: 0, y: 0 },
          data: {
            label: '意图路由',
            intentConfig: {
              categories: ['coding'],
              classifier: { providerId: 'prov-1', modelName: 'some-uuid-1111-2222-333333333333' },
            },
          },
        },
        {
          id: 'target-coding',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-coding' },
        },
        {
          id: 'target-default',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-default' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'intent-1' },
        { id: 'e2', source: 'intent-1', sourceHandle: 'handle-coding', target: 'target-coding' },
        { id: 'e3', source: 'intent-1', sourceHandle: 'handle-default', target: 'target-default' },
      ],
    }

    // resolver 是 async —— 模拟 DB round-trip
    const resolver: ClassifierModelNameResolver = async (_providerId, modelName) => {
      await new Promise((r) => setTimeout(r, 1))
      return modelName === 'some-uuid-1111-2222-333333333333' ? 'gpt-4o-mini' : modelName
    }

    const matchers = await compileCanvasToMatchers(graph, resolver)
    const match = matchByModelName(matchers, 'plan', { model: 'plan', streaming: false })
    if (match?.action.type === 'intent') {
      expect(match.action.intentConfig?.classifier?.modelName).toBe('gpt-4o-mini')
    }
  })

  it('modelTrigger → fallback(primary: intent) 嵌套场景，intent 的 targetGroupIds 仍从边推导', async () => {
    // 回归用例：生产环境曾出现 intent 节点被套在 fallback 主备链的 primary 分支下时，
    // targetGroupIds 恒为 {} → routeCandidatesByGroupId('') 抛 uuid 语法错误 →
    // 请求悄悄总是走 backup，intent 分类结果从未生效。
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'plan', label: 'Plan' },
        },
        {
          id: 'fallback-1',
          type: 'fallback',
          position: { x: 0, y: 0 },
          data: { label: '降级链' },
        },
        {
          id: 'intent-1',
          type: 'intent',
          position: { x: 0, y: 0 },
          data: {
            label: '意图路由',
            intentConfig: {
              categories: ['coding'],
              classifier: { providerId: 'prov-1', modelName: 'classifier-model' },
            },
          },
        },
        {
          id: 'target-coding',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-coding' },
        },
        {
          id: 'backup-t',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-backup' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'fallback-1' },
        { id: 'e2', source: 'fallback-1', sourceHandle: 'handle-primary', target: 'intent-1' },
        { id: 'e3', source: 'fallback-1', sourceHandle: 'handle-backup', target: 'backup-t' },
        { id: 'e4', source: 'intent-1', sourceHandle: 'handle-coding', target: 'target-coding' },
      ],
    }
    const matchers = await compileCanvasToMatchers(graph)

    const match = matchByModelName(matchers, 'plan', { model: 'plan', streaming: false })
    expect(match?.action.type).toBe('fallback')
    if (match?.action.type === 'fallback') {
      expect(match.action.primary?.type).toBe('intent')
      expect(match.action.primary?.intentConfig?.targetGroupIds).toEqual({
        coding: 'group-coding',
      })
    }
  })

  it('modelTrigger → capability 节点，capabilityMap/defaultGroupId 从 handle-{capability} 边推导', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'plan', label: 'Plan' },
        },
        {
          id: 'capability-1',
          type: 'capability',
          position: { x: 0, y: 0 },
          data: { label: '能力路由', capabilityConfig: { capabilities: ['vision'] } },
        },
        {
          id: 'target-vision',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-vision' },
        },
        {
          id: 'target-default',
          type: 'target',
          position: { x: 0, y: 0 },
          data: { actionType: 'route_to_group', targetId: 'group-default' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'capability-1' },
        {
          id: 'e2',
          source: 'capability-1',
          sourceHandle: 'handle-vision',
          target: 'target-vision',
        },
        {
          id: 'e3',
          source: 'capability-1',
          sourceHandle: 'handle-default',
          target: 'target-default',
        },
      ],
    }
    const matchers = await compileCanvasToMatchers(graph)

    const match = matchByModelName(matchers, 'plan', { model: 'plan', streaming: false })
    expect(match?.action.type).toBe('capability')
    if (match?.action.type === 'capability') {
      expect(match.action.capabilityConfig).toEqual({
        capabilityMap: { vision: 'group-vision' },
        defaultGroupId: 'group-default',
      })
    }
  })

  it('循环引用被检测并停止遍历', async () => {
    const graph: CanvasGraph = {
      nodes: [
        {
          id: 'vm-am-1',
          type: 'modelTrigger',
          position: { x: 0, y: 0 },
          data: { vmId: 'am-1', modelName: 'gpt-4', label: 'GPT-4' },
        },
        {
          id: 'cond-1',
          type: 'condition',
          position: { x: 0, y: 0 },
          data: { label: 'c', field: 'context.streaming', operator: 'eq', value: 'false' },
        },
      ],
      edges: [
        { id: 'e1', source: 'vm-am-1', target: 'cond-1' },
        { id: 'e2', source: 'cond-1', sourceHandle: 'true', target: 'vm-am-1' },
      ],
    }
    expect(() => compileCanvasToMatchers(graph)).not.toThrow()
    // 循环不产生有效 matcher（因为没有 leaf）
    expect(await compileCanvasToMatchers(graph)).toHaveLength(0)
  })
})
