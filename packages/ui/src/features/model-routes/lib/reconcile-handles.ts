import type { Edge, Node } from '@xyflow/react'
import { NodeTypeRegistry, getValidHandleIds, type NodeType } from '@xartifact/x-herald-shared'

interface IntentConfigShape {
  categories?: string[]
  classifier?: { providerId?: string; modelName?: string }
}

interface CapabilityConfigShape {
  capabilities?: string[]
}

interface NestedNodeData {
  intentConfig?: IntentConfigShape
  capabilityConfig?: CapabilityConfigShape
}

function isNodeType(type: string | undefined): type is NodeType {
  return type !== undefined && type in NodeTypeRegistry
}

export function getCategoryList(data: unknown, type: string): string[] | undefined {
  if (type !== 'intent' && type !== 'capability') return undefined
  const d = data as NestedNodeData | undefined
  if (type === 'intent') return d?.intentConfig?.categories
  return d?.capabilityConfig?.capabilities
}

export function getDefaultHandleId(_data: unknown, type: string): string | undefined {
  if (type !== 'intent' && type !== 'capability') return undefined
  return 'handle-default'
}

/**
 * 该节点当前合法的 source handle 集合 —— 委托给 shared 的 NodeTypeRegistry/
 * getValidHandleIds，替代原来按 node.type 字符串手写的 condition/fallback/
 * intent/capability 分支。
 */
export function getValidSourceHandles(node: Node | undefined): Set<string> {
  if (!node || !isNodeType(node.type)) return new Set()
  return getValidHandleIds(node.type, node.data)
}

export function pruneOrphanedEdges(
  oldNode: Node | undefined,
  newData: Record<string, unknown>,
  edges: Edge[],
): Edge[] {
  if (!oldNode || !isNodeType(oldNode.type)) return edges
  // 只有 handle 数量随 data 变化的"动态握手"类型（intent/capability）才需要剪枝——
  // 其余类型的 handle 集合是固定的，data 变化不会让已有连线失效。
  if (NodeTypeRegistry[oldNode.type].handles.kind !== 'dynamic') return edges

  const merged = { ...(oldNode.data ?? {}), ...newData }
  const validHandles = getValidHandleIds(oldNode.type, merged)

  return edges.filter((e) => {
    if (e.source !== oldNode.id) return true
    if (!e.sourceHandle) return true
    return validHandles.has(e.sourceHandle)
  })
}

export function annotateInvalidEdges(nodes: Node[], edges: Edge[]): Edge[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  return edges.map((e) => {
    const source = nodeMap.get(e.source)
    if (!source || !e.sourceHandle) {
      return stripInvalidStyle(e)
    }
    const valid = getValidSourceHandles(source)
    if (valid.size === 0) return stripInvalidStyle(e)
    if (!valid.has(e.sourceHandle)) {
      return {
        ...e,
        style: { ...(e.style ?? {}), stroke: '#ef4444', strokeDasharray: '4 4' },
        className: [e.className, 'edge-invalid-handle'].filter(Boolean).join(' '),
        data: { ...(e.data as object), invalidHandle: true },
      }
    }
    return stripInvalidStyle(e)
  })
}

function stripInvalidStyle(e: Edge): Edge {
  const data = e.data as { invalidHandle?: boolean } | undefined
  if (!data?.invalidHandle) return e
  const { invalidHandle: _, ...restData } = data
  const style = { ...(e.style ?? {}) }
  delete style.stroke
  delete style.strokeDasharray
  const className = (e.className ?? '')
    .split(/\s+/)
    .filter((c) => c && c !== 'edge-invalid-handle')
    .join(' ')
  return {
    ...e,
    style: Object.keys(style).length ? style : undefined,
    className: className || undefined,
    data: Object.keys(restData).length ? restData : undefined,
  }
}
