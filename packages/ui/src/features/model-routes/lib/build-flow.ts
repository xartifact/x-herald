import type { Node } from '@xyflow/react'

export interface AccessModelRef {
  id: string
  name: string
  displayName: string | null
  enabled?: boolean
}

/**
 * 将画布节点与 DB 中的接入模型双向同步：
 *   - 移除：DB 已删除/禁用的接入模型，对应 vm 节点从画布上剔除（避免 deploy 400）
 *   - 添加：DB 中新增启用的接入模型，自动补齐对应 vm 节点
 *
 * @returns 补齐后的画布节点 + 被移除的 vmId 列表（调用方清理 dangling edges）
 */
export function ensureAccessModelNodes(
  nodes: Node[],
  accessModels: AccessModelRef[],
): { nodes: Node[]; removedVmIds: string[] } {
  const validAmIds = new Set(accessModels.filter((am) => am.enabled !== false).map((am) => am.id))

  const kept: Node[] = []
  const removedVmIds: string[] = []
  const existingVmIds = new Set<string>()
  for (const n of nodes) {
    if (n.type !== 'modelTrigger') {
      kept.push(n)
      continue
    }
    const vmId = (n.data as { vmId?: string } | undefined)?.vmId ?? n.id.replace(/^vm-/, '')
    if (!validAmIds.has(vmId)) {
      removedVmIds.push(vmId)
      continue
    }
    kept.push(n)
    existingVmIds.add(vmId)
  }

  const seen = new Set<string>(existingVmIds)
  const missing: Node[] = []

  for (const am of accessModels) {
    if (seen.has(am.id)) continue
    if (am.enabled === false) continue
    missing.push({
      id: `vm-${am.id}`,
      type: 'modelTrigger',
      position: { x: 0, y: 0 },
      data: {
        label: am.displayName || am.name,
        modelName: am.name,
        vmId: am.id,
      },
    })
    seen.add(am.id)
  }

  if (missing.length === 0 && removedVmIds.length === 0) {
    return { nodes, removedVmIds }
  }
  return { nodes: [...kept, ...missing], removedVmIds }
}
