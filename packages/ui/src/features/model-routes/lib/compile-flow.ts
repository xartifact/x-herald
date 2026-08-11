import type { Node, Edge } from '@xyflow/react'

import {
  getValidHandleIds,
  NodeTypeRegistry,
  validateNodeData,
  type NodeType,
} from '@xartifact/x-llm-gateway-shared'

export interface ValidationError {
  nodeId: string
  message: string
}

function isNodeType(type: string | undefined): type is NodeType {
  return type !== undefined && type in NodeTypeRegistry
}

export function validateFlow(nodes: Node[], edges: Edge[]): ValidationError[] {
  const errors: ValidationError[] = []
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  for (const node of nodes) {
    if (!isNodeType(node.type)) continue
    const presentHandles = new Set(
      edges.flatMap((e) => (e.source === node.id && e.sourceHandle ? [e.sourceHandle] : [])),
    )
    const messages = validateNodeData(node.type, node.data, presentHandles)
    for (const message of messages) {
      errors.push({ nodeId: node.id, message })
    }
  }

  const vmIds = new Set(nodes.filter((n) => n.type === 'modelTrigger').map((n) => n.id))
  if (vmIds.size > 0) {
    const outgoing = new Map<string, string[]>()
    for (const e of edges) {
      const list = outgoing.get(e.source) ?? []
      list.push(e.target)
      outgoing.set(e.source, list)
    }
    const reachable = new Set<string>(vmIds)
    const stack = [...vmIds]
    while (stack.length > 0) {
      const cur = stack.pop()!
      for (const next of outgoing.get(cur) ?? []) {
        if (!reachable.has(next)) {
          reachable.add(next)
          stack.push(next)
        }
      }
    }
    for (const n of nodes) {
      if (!vmIds.has(n.id) && !reachable.has(n.id)) {
        errors.push({ nodeId: n.id, message: '孤立节点：没有任何 VM 入口可到达' })
      }
    }
  }

  const color = new Map<string, number>()
  for (const n of nodes) color.set(n.id, 0)
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    const list = adj.get(e.source) ?? []
    list.push(e.target)
    adj.set(e.source, list)
  }
  function detectCycle(startId: string, path: string[]): boolean {
    color.set(startId, 1)
    path.push(startId)
    for (const next of adj.get(startId) ?? []) {
      if (color.get(next) === 1) {
        const cycleStart = path.indexOf(next)
        errors.push({
          nodeId: next,
          message: `检测到循环：${path.slice(cycleStart).concat(next).join(' → ')}`,
        })
        return true
      }
      if (color.get(next) === 0 && detectCycle(next, path)) return true
    }
    color.set(startId, 2)
    path.pop()
    return false
  }
  for (const n of nodes) {
    if (color.get(n.id) === 0) detectCycle(n.id, [])
  }

  for (const e of edges) {
    if (!e.sourceHandle) continue
    const source = nodeMap.get(e.source)
    if (!source || !isNodeType(source.type)) continue
    const validHandles = getValidHandleIds(source.type, source.data)
    if (validHandles.size > 0 && !validHandles.has(e.sourceHandle)) {
      errors.push({
        nodeId: e.source,
        message: `Edge 引用了不存在的 handle "${e.sourceHandle}"`,
      })
    }
  }

  return errors
}
