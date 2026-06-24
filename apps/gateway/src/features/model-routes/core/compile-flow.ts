import type { Node, Edge } from '@xyflow/react'

import type { RouteCondition, RouteAction, CreateModelRoutePayload } from '../types'

function buildOutEdgeMap(edges: Edge[]): Map<string, Edge[]> {
  const map = new Map<string, Edge[]>()
  for (const edge of edges) {
    if (!map.has(edge.source)) map.set(edge.source, [])
    map.get(edge.source)!.push(edge)
  }
  return map
}

function extractCondition(node: Node): RouteCondition | null {
  const d = node.data as Record<string, unknown>
  const field = d.field as string | undefined
  const operator = d.operator as string | undefined
  if (!field || !operator) return null
  return {
    field,
    operator: operator as RouteCondition['operator'],
    value: operator === 'exists' ? undefined : d.value,
  }
}

function extractAction(node: Node): RouteAction | null {
  const d = node.data as Record<string, unknown>
  if (node.type === 'reject') {
    return { type: 'reject', reason: (d.reason as string) || undefined }
  }
  if (node.type === 'fallback') {
    return { type: 'fallback' }
  }
  if (node.type === 'target') {
    const actionType = d.actionType as string | undefined
    const targetId = d.targetId as string | undefined
    if (!actionType || !targetId) return null
    return { type: actionType as RouteAction['type'], targetId }
  }
  return null
}

interface PathEntry {
  conditions: RouteCondition[]
  leaf: Node
}

function dfs(
  node: Node,
  accConditions: RouteCondition[],
  outEdges: Map<string, Edge[]>,
  nodeMap: Map<string, Node>,
  visitedInPath: Set<string>,
  results: PathEntry[],
): void {
  if (visitedInPath.has(node.id)) return

  const isLeaf = node.type === 'target' || node.type === 'reject' || node.type === 'fallback'
  if (isLeaf) {
    results.push({ conditions: [...accConditions], leaf: node })
    return
  }

  const newVisited = new Set(visitedInPath)
  newVisited.add(node.id)
  const nextEdges = outEdges.get(node.id) || []

  if (node.type === 'condition') {
    const cond = extractCondition(node)
    for (const edge of nextEdges) {
      const nextNode = nodeMap.get(edge.target)
      if (!nextNode) continue
      if (edge.sourceHandle === 'true') {
        const newConds = cond ? [...accConditions, cond] : [...accConditions]
        dfs(nextNode, newConds, outEdges, nodeMap, newVisited, results)
      } else {
        dfs(nextNode, [...accConditions], outEdges, nodeMap, newVisited, results)
      }
    }
    return
  }

  for (const edge of nextEdges) {
    const nextNode = nodeMap.get(edge.target)
    if (nextNode) dfs(nextNode, [...accConditions], outEdges, nodeMap, newVisited, results)
  }
}

export interface ValidationError {
  nodeId: string
  message: string
}

export function validateFlow(nodes: Node[], edges: Edge[]): ValidationError[] {
  const errors: ValidationError[] = []
  for (const node of nodes) {
    if (node.type === 'condition') {
      const d = node.data as Record<string, unknown>
      if (!d.field || !d.operator) {
        errors.push({ nodeId: node.id, message: '条件节点未配置字段或操作符' })
      }
    }
    if (node.type === 'target') {
      const d = node.data as Record<string, unknown>
      if (!d.actionType || !d.targetId) {
        errors.push({ nodeId: node.id, message: '目标节点未配置动作或目标' })
      }
    }
  }
  return errors
}

export function compileFlowToRoutes(nodes: Node[], edges: Edge[]): CreateModelRoutePayload[] {
  const outEdges = buildOutEdgeMap(edges)
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const vmNodes = nodes.filter(n => n.type === 'modelTrigger')

  // signature → { vmIds, conditions, leaf }
  const pathMap = new Map<string, { vmIds: string[]; conditions: RouteCondition[]; leaf: Node }>()

  for (const vmNode of vmNodes) {
    const vmId = vmNode.id.replace(/^vm-/, '')
    const nextEdges = outEdges.get(vmNode.id) || []

    for (const edge of nextEdges) {
      const nextNode = nodeMap.get(edge.target)
      if (!nextNode) continue

      const paths: PathEntry[] = []
      dfs(nextNode, [], outEdges, nodeMap, new Set([vmNode.id]), paths)

      for (const path of paths) {
        const sig = `${JSON.stringify(path.conditions)}|${path.leaf.id}`
        if (pathMap.has(sig)) {
          pathMap.get(sig)!.vmIds.push(vmId)
        } else {
          pathMap.set(sig, { vmIds: [vmId], conditions: path.conditions, leaf: path.leaf })
        }
      }
    }
  }

  const entries = Array.from(pathMap.values()).map(entry => {
    const action = extractAction(entry.leaf)
    if (!action) return null
    const d = entry.leaf.data as Record<string, unknown>
    const condCount = entry.conditions.length
    const name = ((d.label as string) ||
      (condCount > 0
        ? entry.conditions.map(c => `${c.field} ${c.operator} ${String(c.value ?? '')}`).join(' & ')
        : action.type)).slice(0, 255)
    return {
      name,
      accessModelIds: [...new Set(entry.vmIds)],
      conditions: entry.conditions,
      action,
      enabled: true,
      _condCount: condCount,
      _leafY: (entry.leaf.position?.y ?? 0),
    }
  }).filter(Boolean) as Array<CreateModelRoutePayload & { _condCount: number; _leafY: number }>

  entries.sort((a, b) => b._condCount - a._condCount || a._leafY - b._leafY)

  return entries.map(({ _condCount: _, _leafY: __, ...payload }, i) => ({
    ...payload,
    priority: i * 10,
  }))
}
