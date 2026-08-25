import { useMemo } from 'react'

import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import type { AccessModelRouteOverview } from '@xartifact/x-herald-shared'

import { runAutoLayout } from '../lib/layout-flow'
import { nodeTypes } from './flow-editor-constants'
/** 接入模型分组用的固定调色板（按列循环分配） */
const AM_COLORS = [
  '#2563eb',
  '#059669',
  '#d97706',
  '#7c3aed',
  '#dc2626',
  '#0891b2',
  '#db2777',
  '#4f46e5',
  '#65a30d',
  '#ca8a04',
]
const COLUMN_MIN_WIDTH = 200
/** 每个接入模型子图距页面顶部/左侧的起始偏移（给列头标题留空间） */
const HEADER_HEIGHT = 96
/** 列间距，避免列内容贴着相邻列 */
const COLUMN_GUTTER = 24

/**
 * 节点渲染宽度估计。dagre 布局时统一按 160px 假设节点宽，但 intent/capability
 * 是动态 handle 节点：实际宽度 = max(160, (handle 数 + 1) * 80 + 32)，分类越多
 * 越宽（4 个分类 ≈ 432px）。列宽推进必须用真实宽度，否则宽节点会侵入相邻列。
 */
function nodeRenderWidth(n: Node): number {
  if (n.type === 'intent' || n.type === 'capability') {
    const list =
      n.type === 'intent'
        ? ((n.data as { intentConfig?: { categories?: string[] } } | undefined)?.intentConfig
            ?.categories ?? [])
        : ((n.data as { capabilityConfig?: { capabilities?: string[] } } | undefined)
            ?.capabilityConfig?.capabilities ?? [])
    return Math.max(160, (list.length + 1) * 80 + 32)
  }
  // 其余类型（modelTrigger 192 / condition 180 / target 160 / fallback 160）的保守估计
  return 200
}

function scope(amId: string, id: string): string {
  return `${amId}::${id}`
}
export interface OverviewGraph {
  nodes: Node[]
  edges: Edge[]
}

/**
 * 单个接入模型的子图统一排版：无条件 dagre TB 紧凑重排 + 归一化到原点。
 *
 * 俯瞰图是只读聚合视图，不沿用画布中的用户拖拽坐标 —— 负偏移/横向长链会把
 * 内容推出列槽，直接造成分组间重叠；dagre TB 保证每列内部是紧凑的纵向拓扑，
 * 丢弃用户手动排布换来"分组永不重叠"。
 */
function layoutSubgraphForOverview(graph: { nodes: Node[]; edges: Edge[] }): {
  nodes: Node[]
  edges: Edge[]
} {
  const { nodes, edges } = graph
  if (nodes.length === 0) return { nodes, edges }

  const layouted = runAutoLayout(nodes, edges, 'TB').nodes
  const minX = Math.min(...layouted.map((n) => n.position?.x ?? 0))
  const minY = Math.min(...layouted.map((n) => n.position?.y ?? 0))
  return {
    nodes: layouted.map((n) => ({
      ...n,
      position: {
        x: (n.position?.x ?? 0) - minX,
        y: (n.position?.y ?? 0) - minY,
      },
    })),
    edges,
  }
}

/**
 * 把全局路由俯瞰图数据渲染为聚合的 React Flow 图：
 * 每个接入模型占一列（子图节点 id 以 accessModelId:: 命名空间避免跨列冲突），
 * 按调色板为每列节点/边着色，列首放一个标题节点显示接入模型名 + 版本。
 * 纯只读：nodesDraggable / nodesConnectable 均为 false，仅平移缩放 + fitView。
 */
export function buildOverviewGraph(data: AccessModelRouteOverview): OverviewGraph {
  const nodes: Node[] = []
  const edges: Edge[] = []
  // 列宽由内容决定、贪心推进：最小 200（占位列宽度），按真实内容宽（节点 x +
  // 类型感知宽度）推进下一列起点，数学上保证相邻分组永不重叠，且窄列不再
  // 被 360 下限撑出大片空白。
  let cursor = COLUMN_GUTTER

  data.forEach((entry, idx) => {
    const am = entry.accessModel
    const color = AM_COLORS[idx % AM_COLORS.length]
    const xOff = cursor

    const title = [am.displayName, am.name].filter(Boolean).join(' · ')
    const versionBadge = entry.rule ? ` v${entry.rule.version}` : ' — 未配置路由规则'
    nodes.push({
      id: `am-${am.id}`,
      type: 'overviewHeader',
      position: { x: xOff, y: 0 },
      data: { label: `${title}${versionBadge}` },
      style: { borderColor: color },
    })

    const graph = entry.graph
    if (!graph.nodes.length) {
      nodes.push({
        id: `vm-${am.id}`,
        type: 'modelTrigger',
        position: { x: xOff + 40, y: HEADER_HEIGHT },
        data: { label: am.name, modelName: am.name },
        style: { borderColor: color },
      })
      cursor = xOff + COLUMN_MIN_WIDTH + COLUMN_GUTTER
      return
    }

    const layouted = layoutSubgraphForOverview(graph)
    for (const n of layouted.nodes) {
      nodes.push({
        ...n,
        id: scope(am.id, n.id),
        position: {
          x: (n.position?.x ?? 0) + xOff,
          y: (n.position?.y ?? 0) + HEADER_HEIGHT,
        },
        style: { ...(n.style ?? {}), borderColor: color },
      })
    }

    for (const e of layouted.edges) {
      edges.push({
        ...e,
        id: scope(am.id, e.id),
        source: scope(am.id, e.source),
        target: scope(am.id, e.target),
        style: { stroke: color },
      })
    }
    // 内容右边界 = 最右节点左上角 x + 该节点真实渲染宽度（类型感知）
    const contentWidth = Math.max(
      ...layouted.nodes.map((n) => (n.position?.x ?? 0) + nodeRenderWidth(n)),
    )
    cursor = xOff + Math.max(COLUMN_MIN_WIDTH, contentWidth + COLUMN_GUTTER) + COLUMN_GUTTER
  })

  return { nodes, edges }
}

/** 列头标题节点（接入模型名 + 版本） */
function OverviewHeaderNode({
  data,
  style,
}: {
  data: { label?: string }
  style?: React.CSSProperties
}) {
  return (
    <div
      className="rounded-md border-2 bg-background px-3 py-1.5 text-sm font-semibold text-foreground shadow-sm"
      style={{ borderColor: style?.borderColor ?? '#2563eb' }}
    >
      {data.label}
    </div>
  )
}

const overviewNodeTypes = { ...nodeTypes, overviewHeader: OverviewHeaderNode }

interface RouteOverviewCanvasProps {
  data: AccessModelRouteOverview
  width?: number
  height?: number
}

export function RouteOverviewCanvas({ data }: RouteOverviewCanvasProps) {
  const { nodes, edges } = useMemo(() => buildOverviewGraph(data), [data])

  return (
    <div className="h-full w-full min-h-[480px]">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={overviewNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.12 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        deleteKeyCode={null}
        className="bg-muted"
      >
        <Controls />
        <MiniMap pannable zoomable className="rounded-lg border shadow-sm" />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>
  )
}
