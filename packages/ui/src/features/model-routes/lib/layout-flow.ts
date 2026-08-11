import dagre from '@dagrejs/dagre'
import { type Node, type Edge, Position } from '@xyflow/react'

export type LayoutDirection = 'TB' | 'LR'

interface NodeDimensions {
  width: number
  height: number
}

const NODE_DIMENSIONS: Record<string, NodeDimensions> = {
  modelTrigger: { width: 160, height: 60 },
  condition: { width: 180, height: 80 },
  target: { width: 160, height: 70 },
  reject: { width: 160, height: 60 },
  fallback: { width: 160, height: 60 },
  default: { width: 160, height: 60 },
}

const GRID_COLS = 4
const GRID_X_STEP = 240
const GRID_Y_STEP = 150
const GRID_X_OFFSET = 60
const GRID_Y_OFFSET = 60

/**
 * 显式触发的"自动布局"：用 Dagre TB/LR 拓扑排序重排所有节点。
 *
 * 使用场景：用户在画布上点 "Auto-Layout" 按钮。属于"用户显式操作"，
 * 覆盖当前所有节点位置是用户预期的。运行完之后用户还可以继续微调。
 *
 * 不在以下场景调用（保留用户拖动位置）：
 *  - 页面打开/数据刷新（用 fillEmptyPositions）
 *  - 用户拖动节点（React Flow 内部 state，不走这个函数）
 *  - 新增/删除节点（use-flow-canvas 走 fillEmptyPositions）
 */
export function runAutoLayout(
  nodes: Node[],
  edges: Edge[],
  direction: LayoutDirection = 'TB',
): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  const g = new dagre.graphlib.Graph()
  g.setDefaultEdgeLabel(() => ({}))
  g.setGraph({ rankdir: direction, nodesep: 50, ranksep: 80 })

  for (const node of nodes) {
    const dimensions = NODE_DIMENSIONS[node.type ?? 'default'] ?? NODE_DIMENSIONS.default
    g.setNode(node.id, { width: dimensions.width, height: dimensions.height })
  }

  for (const edge of edges) {
    if (!edge.source || !edge.target) continue
    g.setEdge(edge.source, edge.target, { label: edge.sourceHandle ?? '' })
  }

  dagre.layout(g)

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = g.node(node.id)
    const dimensions = NODE_DIMENSIONS[node.type ?? 'default'] ?? NODE_DIMENSIONS.default
    return {
      ...node,
      position: {
        x: (nodeWithPosition.x ?? 0) - dimensions.width / 2,
        y: (nodeWithPosition.y ?? 0) - dimensions.height / 2,
      },
      sourcePosition: direction === 'LR' ? Position.Right : undefined,
      targetPosition: direction === 'LR' ? Position.Left : undefined,
    } as Node
  })

  return { nodes: layoutedNodes, edges }
}

/**
 * 极简网格填充：只对 position === (0, 0) 的节点按数组顺序铺成 4 列网格，
 * 已经设置非默认位置的节点原样保留（由前端画布的 useReducer state + localStorage draft 持久化）。
 *
 * 行为契约：
 *  - 页面打开/数据刷新：build-flow 调本函数，未定位节点 → 网格
 *  - 新增/删除节点：use-flow-canvas 调本函数，未定位节点 → 网格
 *  - 用户拖动节点：不走本函数（React Flow 内部 state），位置保留
 *  - direction 参数被忽略（这是一个网格布局，没有方向概念）
 */
export function fillEmptyPositions(nodes: Node[], edges: Edge[]): { nodes: Node[]; edges: Edge[] } {
  if (nodes.length === 0) {
    return { nodes: [], edges: [] }
  }

  let unpositionedIndex = 0
  const layoutedNodes = nodes.map((node) => {
    if (node.position.x !== 0 || node.position.y !== 0) {
      return node
    }
    const gridX = GRID_X_OFFSET + (unpositionedIndex % GRID_COLS) * GRID_X_STEP
    const gridY = GRID_Y_OFFSET + Math.floor(unpositionedIndex / GRID_COLS) * GRID_Y_STEP
    unpositionedIndex++
    return {
      ...node,
      position: { x: gridX, y: gridY },
    }
  })

  return { nodes: layoutedNodes, edges }
}

/**
 * 兼容旧名 — 现有调用方 (build-flow.ts / use-flow-canvas.ts) 期望函数叫
 * `getLayoutedElements`。新代码请改用 `fillEmptyPositions` 或 `runAutoLayout`。
 */
export const getLayoutedElements = fillEmptyPositions
