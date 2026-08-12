/**
 * Route Rule Compiler — 把画布图（CanvasGraph）编译成可执行的 RouteMatcher[]
 *
 * 从 canvas-route-engine.ts 拆分出来的纯函数模块：只负责"图 → RouteAction"的编译，
 * 不持有任何状态或缓存（那部分留在 CanvasRouteEngine / 未来的 RouteRuleEngine）。
 *
 * 叶子节点（target/reject/intent/capability/fallback）的编译逻辑通过 NodeCompilerRegistry
 * 按 node.type 查表分发，替代原来的 if/else 链——新增一种叶子类型只需要在 registry 里
 * 注册一个 compiler 函数，不需要改这个文件里的其余逻辑。
 */

import {
  resolveHandleTarget,
  type CanvasGraph,
  type GraphEdge,
  type GraphNode,
  type NodeType,
  type RouteAction,
  type RouteCondition,
} from '@xartifact/x-herald-shared'

export interface RouteMatcher {
  id: string
  routeName: string
  accessModelIds: string[]
  accessModelNames: string[]
  conditions: RouteCondition[]
  action: RouteAction
  priority: number
  enabled: boolean
}

/**
 * 意图分类器 modelName 解析器签名。
 *
 * 用途：route_rules.graph 中 intent 节点的 classifier.modelName 字段历史上
 * 可能保存为 model_instance.id (UUID)，但实际发送给上游 LLM 时必须用
 * instance.actual_model_name。这个 resolver 让编译器把"原始 modelName"
 * 规范化为"上游需要的 actual_model_name"，避免脏数据 → 400 的故障。
 *
 * 默认实现（identityResolver）什么都不做——纯函数测试用它就够了。
 * 运行时由 RouteRuleEngine 注入 DB-backed 实现。
 */
export type ClassifierModelNameResolver = (
  providerId: string,
  modelName: string,
) => string | Promise<string>

const identityResolver: ClassifierModelNameResolver = (_providerId, modelName) => modelName

/**
 * 单个叶子类型的编译上下文。compileSubGraph 只在 fallback 的
 * primary/backup 递归解析时会被用到。
 */
export interface NodeCompileContext {
  node: GraphNode
  outEdges: Map<string, GraphEdge[]>
  nodeMap: Map<string, GraphNode>
  compileSubGraph: (
    start: GraphNode,
    visited: Set<string>,
  ) => RouteAction | null | Promise<RouteAction | null>
  resolveClassifierModelName: ClassifierModelNameResolver
}

export type NodeCompiler = (
  ctx: NodeCompileContext,
) => RouteAction | null | Promise<RouteAction | null>

function resolveHandleTargetId(
  nodeId: string,
  handleId: string,
  outEdges: Map<string, GraphEdge[]>,
  nodeMap: Map<string, GraphNode>,
): string | undefined {
  const target = resolveHandleTarget(nodeId, handleId, outEdges, nodeMap)
  return (target?.data as { targetId?: string } | undefined)?.targetId
}

/**
 * 每种叶子类型的编译器。只有会产出 RouteAction 的"叶子"类型才注册
 * （modelTrigger / condition 是纯图遍历节点，不在这里）。
 */
export const NodeCompilerRegistry: Partial<Record<NodeType, NodeCompiler>> = {
  reject: ({ node }) => {
    const data = node.data as Record<string, unknown>
    return { type: 'reject', reason: (data.reason as string) ?? '' }
  },

  target: ({ node }) => {
    const data = node.data as Record<string, unknown>
    const actionType = (data.actionType as RouteAction['type']) ?? 'route_to_access_model'
    const targetId = data.targetId as string | undefined
    return { type: actionType, targetId }
  },

  intent: async ({ node, outEdges, nodeMap, compileSubGraph, resolveClassifierModelName }) => {
    const data = node.data as Record<string, unknown>
    const ic = data.intentConfig as
      | { classifier?: { providerId?: string; modelName?: string }; categories?: string[] }
      | undefined
    if (!ic) return null
    const categories = ic.categories ?? []

    // 沿边解析每个 category handle 指向的真实节点，按节点类型分流：
    //   - target 节点  → targetGroupIds[cat] = targetId（直连组，快路径）
    //   - 其他节点（fallback / intent / capability / reject）
    //                 → targetActions[cat] = compiled RouteAction
    //                   （复杂拓扑 —— 修复 "复杂任务" 类路由到降级链后
    //                     被静默丢弃" 的历史 bug）
    // 两条路径可并存：同一 intent 节点下，部分 category 直连、部分走降级链。
    const targetGroupIds: Record<string, string> = {}
    const targetActions: Record<string, RouteAction> = {}
    for (const category of categories) {
      const targetNode = resolveHandleTarget(node.id, `handle-${category}`, outEdges, nodeMap)
      if (!targetNode) continue
      // target 节点 + 有 targetId → 直连组（快路径）
      // target 节点 + 缺 targetId → 静默丢弃（保留旧行为）
      // 其他类型（fallback / intent / capability / reject）→ 递归编译为 RouteAction
      const directId = resolveHandleTargetId(node.id, `handle-${category}`, outEdges, nodeMap)
      if (directId) {
        targetGroupIds[category] = directId
      } else if (targetNode.type !== 'target') {
        const compiled = await compileSubGraph(targetNode, new Set())
        if (compiled) targetActions[category] = compiled
      }
    }

    // default handle：同上分流
    let defaultGroupId: string | undefined
    let defaultAction: RouteAction | undefined
    const defaultNode = resolveHandleTarget(node.id, 'handle-default', outEdges, nodeMap)
    if (defaultNode) {
      const directId = resolveHandleTargetId(node.id, 'handle-default', outEdges, nodeMap)
      if (directId) {
        defaultGroupId = directId
      } else if (defaultNode.type !== 'target') {
        const compiled = await compileSubGraph(defaultNode, new Set())
        if (compiled) defaultAction = compiled
      }
    }

    let resolvedModelName: string | undefined
    if (ic.classifier?.providerId && ic.classifier?.modelName) {
      // 规范化：graph 里可能是 instance UUID，运行时必须用 actual_model_name
      resolvedModelName = await resolveClassifierModelName(
        ic.classifier.providerId,
        ic.classifier.modelName,
      )
    }

    return {
      type: 'intent',
      intentConfig: {
        targetGroupIds,
        ...(Object.keys(targetActions).length > 0 ? { targetActions } : {}),
        ...(defaultGroupId ? { defaultGroupId } : {}),
        ...(defaultAction ? { defaultAction } : {}),
        ...(ic.classifier?.providerId && resolvedModelName
          ? {
              classifier: {
                providerId: ic.classifier.providerId,
                modelName: resolvedModelName,
                categories,
              },
            }
          : {}),
      },
    }
  },

  capability: ({ node, outEdges, nodeMap }) => {
    const data = node.data as Record<string, unknown>
    const cc = data.capabilityConfig as { capabilities?: string[] } | undefined
    if (!cc) return null
    const capabilities = cc.capabilities ?? []

    const capabilityMap: Record<string, string> = {}
    for (const capability of capabilities) {
      const targetId = resolveHandleTargetId(node.id, `handle-${capability}`, outEdges, nodeMap)
      if (targetId) capabilityMap[capability] = targetId
    }
    const defaultGroupId = resolveHandleTargetId(node.id, 'handle-default', outEdges, nodeMap)

    return {
      type: 'capability',
      capabilityConfig: {
        capabilityMap,
        ...(defaultGroupId ? { defaultGroupId } : {}),
      },
    }
  },

  fallback: async ({ node, outEdges, nodeMap, compileSubGraph }) => {
    const edges = outEdges.get(node.id) ?? []
    const primaryEdge = edges.find((e) => e.sourceHandle === 'handle-primary')
    const backupEdge = edges.find((e) => e.sourceHandle === 'handle-backup')
    if (!primaryEdge || !backupEdge) return null
    const primaryNode = nodeMap.get(primaryEdge.target)
    const backupNode = nodeMap.get(backupEdge.target)
    if (!primaryNode || !backupNode) return null
    const [primaryAction, backupAction] = await Promise.all([
      compileSubGraph(primaryNode, new Set([node.id])),
      compileSubGraph(backupNode, new Set([node.id])),
    ])
    if (!primaryAction || !backupAction) return null
    return { type: 'fallback', primary: primaryAction, backup: backupAction }
  },
}

/**
 * 从叶节点提取 RouteAction —— 按 node.type 在 NodeCompilerRegistry 里查表分发。
 */
async function extractActionFromLeaf(
  leaf: GraphNode,
  outEdges: Map<string, GraphEdge[]>,
  nodeMap: Map<string, GraphNode>,
  resolveClassifierModelName: ClassifierModelNameResolver,
): Promise<RouteAction | null> {
  const compiler = NodeCompilerRegistry[leaf.type as NodeType]
  if (!compiler) return null
  return compiler({
    node: leaf,
    outEdges,
    nodeMap,
    resolveClassifierModelName,
    compileSubGraph: (start, visited) =>
      extractActionFromSubGraph(start, outEdges, nodeMap, visited, resolveClassifierModelName),
  }) as Promise<RouteAction | null> | RouteAction | null
}

/**
 * 递归解析叶子/子图的 RouteAction（供 fallback 主备链使用）。
 *
 * 语义：fallback 节点的 primary/backup 出口可以是：
 *   - target/intent/capability/reject 叶子节点
 *   - 一串 condition 节点（DFS 走 true 边）→ 叶子
 * 不能再是 fallback 节点（避免循环）。
 */
async function extractActionFromSubGraph(
  start: GraphNode,
  outEdges: Map<string, GraphEdge[]>,
  nodeMap: Map<string, GraphNode>,
  visited: Set<string>,
  resolveClassifierModelName: ClassifierModelNameResolver,
): Promise<RouteAction | null> {
  if (visited.has(start.id)) return null
  const newVisited = new Set(visited)
  newVisited.add(start.id)

  const leafAction = await extractActionFromLeaf(
    start,
    outEdges,
    nodeMap,
    resolveClassifierModelName,
  )
  if (leafAction) return leafAction

  // 遇到 condition 节点 → 走 true 边（与 build-flow 语义一致）
  if (start.type === 'condition') {
    const edges = outEdges.get(start.id) ?? []
    const trueEdge = edges.find((e) => e.sourceHandle === 'true') ?? edges[0]
    if (!trueEdge) return null
    const next = nodeMap.get(trueEdge.target)
    if (!next) return null
    return extractActionFromSubGraph(
      next,
      outEdges,
      nodeMap,
      newVisited,
      resolveClassifierModelName,
    )
  }

  return null
}

/**
 * 从单条 DAG 路径编译 RouteMatcher。
 * 路径：从 modelTrigger 节点出发，沿 true 边走过若干 condition，到达 leaf。
 */
async function compileMatcherFromPath(
  trigger: GraphNode,
  condNodes: GraphNode[],
  leaf: GraphNode,
  outEdges: Map<string, GraphEdge[]>,
  nodeMap: Map<string, GraphNode>,
  routePriority: number,
  resolveClassifierModelName: ClassifierModelNameResolver,
): Promise<RouteMatcher | null> {
  const triggerData = trigger.data as { vmId?: string; modelName?: string } | undefined
  const vmId = triggerData?.vmId ?? trigger.id.replace(/^vm-/, '')
  const modelName = triggerData?.modelName

  const conditions: RouteCondition[] = []
  for (const condNode of condNodes) {
    const d = condNode.data as { field?: string; operator?: string; value?: string } | undefined
    if (!d?.field || !d.operator) continue
    conditions.push({
      field: d.field,
      operator: d.operator as RouteCondition['operator'],
      value: d.operator === 'exists' ? undefined : d.value,
    })
  }

  const action = await extractActionFromLeaf(leaf, outEdges, nodeMap, resolveClassifierModelName)
  if (!action) return null

  // fallback 叶子的 routeName 取自叶子自身的 label；其余取自 trigger 的 label
  // （沿用 canvas-route-engine.ts 拆分前的既有行为，不在这次拆分里顺带改掉）。
  const routeName =
    action.type === 'fallback'
      ? ((leaf.data as { label?: string })?.label ?? '降级链')
      : ((trigger.data as { label?: string })?.label ?? 'unused')

  return {
    id: leaf.id,
    routeName,
    accessModelIds: [vmId],
    accessModelNames: modelName ? [modelName] : [],
    conditions,
    action,
    priority: routePriority,
    enabled: true,
  }
}

/**
 * 从 canvas_states.graph 编译所有 RouteMatcher。
 *
 * 算法：对每个 modelTrigger 节点 DFS，沿 true 边走过 condition 链，到达叶节点。
 * 每个 modelTrigger → 叶路径编译为一个 RouteMatcher。
 *
 * @param graph 画布图（nodes + edges）
 * @param resolveClassifierModelName 可选 resolver，用于把意图分类器的 modelName
 *   规范化为上游需要的 actual_model_name（默认 identity —— 不做任何转换）。
 *   路由历史数据里 modelName 字段曾被错误地保存为 model_instance.id (UUID)，
 *   运行时注入一个 DB-backed resolver 即可自动修复，避免 400 故障。
 */
export async function compileCanvasToMatchers(
  graph: CanvasGraph,
  resolveClassifierModelName: ClassifierModelNameResolver = identityResolver,
): Promise<RouteMatcher[]> {
  const nodeMap = new Map<string, GraphNode>()
  for (const node of graph.nodes) nodeMap.set(node.id, node)

  const outEdges = new Map<string, GraphEdge[]>()
  for (const e of graph.edges) {
    const list = outEdges.get(e.source) ?? []
    list.push(e)
    outEdges.set(e.source, list)
  }

  const triggers = graph.nodes.filter((n) => n.type === 'modelTrigger')
  const matchers: RouteMatcher[] = []

  for (const trigger of triggers) {
    await walkFromTrigger(
      trigger,
      trigger,
      [],
      outEdges,
      nodeMap,
      new Set(),
      matchers,
      resolveClassifierModelName,
    )
  }

  return matchers
}

const LEAF_NODE_TYPES = new Set<string>(['target', 'reject', 'fallback', 'intent', 'capability'])

async function walkFromTrigger(
  originalTrigger: GraphNode,
  current: GraphNode,
  condChain: GraphNode[],
  outEdges: Map<string, GraphEdge[]>,
  nodeMap: Map<string, GraphNode>,
  visited: Set<string>,
  matchers: RouteMatcher[],
  resolveClassifierModelName: ClassifierModelNameResolver,
): Promise<void> {
  if (visited.has(current.id)) return
  visited.add(current.id)

  const edges = outEdges.get(current.id) ?? []
  for (const edge of edges) {
    const next = nodeMap.get(edge.target)
    if (!next) continue

    if (next.type === 'condition') {
      await walkFromTrigger(
        originalTrigger,
        next,
        [...condChain, next],
        outEdges,
        nodeMap,
        new Set(visited),
        matchers,
        resolveClassifierModelName,
      )
    } else if (LEAF_NODE_TYPES.has(next.type)) {
      // 到达叶节点，编译为 RouteMatcher（originalTrigger 始终是 modelTrigger）
      const matcher = await compileMatcherFromPath(
        originalTrigger,
        condChain,
        next,
        outEdges,
        nodeMap,
        matchers.length,
        resolveClassifierModelName,
      )
      if (matcher) matchers.push(matcher)
    }
  }
}
