import type { Node, Edge } from '@xyflow/react'

interface RoutingReadonlyTableProps {
  node: Node
  edges: Edge[]
  nodes: Node[]
}

/** intent/capability 节点的只读路由映射表 —— 映射由画布连线决定，不在表单里编辑。 */
export function RoutingReadonlyTable({ node, edges, nodes }: RoutingReadonlyTableProps) {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const nodeEdges = edges.filter((e) => e.source === node.id)

  const isIntent = node.type === 'intent'
  const data = node.data as {
    intentConfig?: { categories?: string[] }
    capabilityConfig?: { capabilities?: string[] }
  }
  const items = isIntent
    ? (data.intentConfig?.categories ?? [])
    : (data.capabilityConfig?.capabilities ?? [])

  const getTarget = (handleId: string) => {
    const edge = nodeEdges.find((e) => e.sourceHandle === handleId)
    if (!edge) return null
    const target = nodeMap.get(edge.target)
    const td = target?.data as { targetName?: string; label?: string } | undefined
    return td?.targetName ?? td?.label ?? 'target'
  }

  return (
    <div className="mt-3 border-t pt-2">
      <p className="text-xs font-semibold text-muted-foreground mb-1.5">
        路由映射（由画布连线决定）
      </p>
      <div className="space-y-0.5">
        {items.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">
            先添加分类/能力，再在画布上连线
          </p>
        )}
        {items.map((item) => {
          const target = getTarget(`handle-${item}`)
          return (
            <div key={item} className="flex items-center justify-between text-xs py-0.5">
              <span className="text-muted-foreground">{item}</span>
              <span className={target ? 'text-foreground font-medium' : 'text-warning'}>
                {target ?? '⚠ 未连接'}
              </span>
            </div>
          )
        })}
        <div className="flex items-center justify-between text-xs py-0.5">
          <span className="text-muted-foreground">默认</span>
          <span
            className={getTarget('handle-default') ? 'text-foreground font-medium' : 'text-warning'}
          >
            {getTarget('handle-default') ?? '⚠ 未连接'}
          </span>
        </div>
      </div>
    </div>
  )
}
