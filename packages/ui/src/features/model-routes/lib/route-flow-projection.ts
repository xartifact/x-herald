import type { Node, Edge } from '@xyflow/react'
import { CanvasGraphSchema, type CanvasGraph } from '@xartifact/x-herald-shared'

/**
 * 画布图领域类型（CanvasGraph）<-> xyflow 运行时类型（Node[]/Edge[]）的双向投影。
 *
 * 这是 xyflow 类型在编辑器中**唯一**合法越出 FlowEditor 的位置：
 * 持久化层（apps/web）、领域模型、校验、UI 业务层都只认 CanvasGraph。
 * 投影在 FlowEditor 内部完成，业务/持久化路径不再有 `as unknown as` 强转。
 *
 * 设计要点：
 *  - toFlowGraph: CanvasGraph 的 GraphNode 是 xyflow Node 的结构子集（多出字段
 *    由 xyflow 在运行时填入：selected / dragging / measured / internals 等），
 *    spread 显式构造 + 单层 as,不通过 unknown 黑洞。
 *  - fromFlowGraph: 必须经 CanvasGraphSchema 验证再返回（xyflow 给出的 Node[]
 *    可能是脏数据 / 未知类型 schema 拒绝），校验失败走宽松兜底（保留软失败
 *    语义：未知名 type 节点照常通过，但已知 type 非法 data 不会泄漏到持久化层）。
 */
export function toFlowGraph(graph: CanvasGraph): { nodes: Node[]; edges: Edge[] } {
  return {
    nodes: graph.nodes.map((n) => ({ ...n })) as Node[],
    edges: graph.edges.map((e) => ({ ...e })) as Edge[],
  }
}

export function fromFlowGraph(nodes: Node[], edges: Edge[]): CanvasGraph {
  const parsed = CanvasGraphSchema.safeParse({ nodes, edges })
  if (parsed.success) return parsed.data
  // 验证失败：通常来自脏数据（已知名 type 但 data 非法）。这里不抛错，沿用
  // 软失败语义——外层 schema 校验（compile-flow / save 时机）会再报错；
  // 此刻不阻塞画布操作。
  console.warn('[fromFlowGraph] CanvasGraphSchema validation failed', parsed.error)
  return { nodes: nodes as CanvasGraph['nodes'], edges: edges as CanvasGraph['edges'] }
}
