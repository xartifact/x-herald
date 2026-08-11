import type { Node } from '@xyflow/react'

import type { ValidationError } from './compile-flow'

export const FLOW_NODE_INVALID_CLASS = 'flow-node-invalid'

export function groupValidationErrors(errors: ValidationError[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const err of errors) {
    const list = map.get(err.nodeId) ?? []
    list.push(err.message)
    map.set(err.nodeId, list)
  }
  return map
}

/**
 * 把校验错误映射到 React Flow node.className（外层 wrapper 红描边）。
 * 不改动 node.data，避免污染编译/草稿序列化。
 */
export function decorateNodesWithValidation(nodes: Node[], errors: ValidationError[]): Node[] {
  if (errors.length === 0) {
    return nodes.map((n) => stripInvalidClass(n))
  }
  const byId = groupValidationErrors(errors)
  return nodes.map((n) => {
    const msgs = byId.get(n.id)
    if (!msgs?.length) return stripInvalidClass(n)
    const base = (n.className ?? '').split(/\s+/).filter((c) => c && c !== FLOW_NODE_INVALID_CLASS)
    base.push(FLOW_NODE_INVALID_CLASS)
    return {
      ...n,
      className: base.join(' '),
      // RF 支持 aria 扩展；title 便于原生 tooltip
      ...({ title: msgs.join('；') } as Partial<Node>),
    }
  })
}

function stripInvalidClass(n: Node): Node {
  if (!n.className?.includes(FLOW_NODE_INVALID_CLASS)) return n
  const className = n.className
    .split(/\s+/)
    .filter((c) => c && c !== FLOW_NODE_INVALID_CLASS)
    .join(' ')
  return { ...n, className: className || undefined }
}
