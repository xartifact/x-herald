import { describe, expect, it } from 'vitest'
import type { Node } from '@xyflow/react'

import { ensureAccessModelNodes, type AccessModelRef } from './build-flow'

function vmNode(id: string): Node {
  return {
    id: `vm-${id}`,
    type: 'modelTrigger',
    position: { x: 0, y: 0 },
    data: { label: id, modelName: id, vmId: id },
  }
}

describe('ensureAccessModelNodes', () => {
  it('补齐画布缺失的 modelTrigger 节点', () => {
    const accessModels = [{ id: 'am-1', name: 'gpt-4', displayName: 'GPT-4' }]
    const { nodes } = ensureAccessModelNodes([], accessModels)

    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toMatchObject({
      id: 'vm-am-1',
      type: 'modelTrigger',
      data: { vmId: 'am-1', modelName: 'gpt-4', label: 'GPT-4' },
    })
  })

  it('已存在的 modelTrigger 节点不重复添加', () => {
    const accessModels = [{ id: 'am-1', name: 'gpt-4', displayName: 'GPT-4' }]
    const existing = vmNode('am-1')
    const { nodes } = ensureAccessModelNodes([existing], accessModels)

    expect(nodes).toHaveLength(1)
    expect(nodes[0]).toBe(existing)
  })

  it('接入模型被禁用时不补齐到画布', () => {
    const accessModels = [{ id: 'am-1', name: 'gpt-4', displayName: 'GPT-4', enabled: false }]
    const { nodes } = ensureAccessModelNodes([], accessModels)

    expect(nodes).toHaveLength(0)
  })

  it('accessModels 为空时返回空数组', () => {
    const accessModels: AccessModelRef[] = []
    const { nodes } = ensureAccessModelNodes([], accessModels)

    expect(nodes).toHaveLength(0)
  })

  it('多个接入模型都补齐', () => {
    const accessModels = [
      { id: 'am-1', name: 'gpt-4', displayName: 'GPT-4' },
      { id: 'am-2', name: 'claude-3', displayName: 'Claude' },
    ]
    const { nodes } = ensureAccessModelNodes([], accessModels)

    expect(nodes).toHaveLength(2)
    const ids = nodes.map((n) => n.id)
    expect(ids).toContain('vm-am-1')
    expect(ids).toContain('vm-am-2')
  })

  it('未补齐任何节点时返回原数组引用（避免无意义重建）', () => {
    const accessModels: AccessModelRef[] = []
    const nodes: Node[] = []
    const result = ensureAccessModelNodes(nodes, accessModels)

    expect(result.nodes).toBe(nodes)
    expect(result.removedVmIds).toEqual([])
  })

  it('优先使用 displayName，无则使用 name', () => {
    const accessModels = [{ id: 'am-1', name: 'gpt-4', displayName: null }]
    const { nodes } = ensureAccessModelNodes([], accessModels)

    expect(nodes[0]?.data).toMatchObject({ label: 'gpt-4' })
  })

  it('DB 中已删除的接入模型，对应 vm 节点从画布上剔除（返回 removedVmIds 供调用方清 dangling edges）', () => {
    const accessModels: AccessModelRef[] = []
    const stale1 = vmNode('am-deleted-1')
    const stale2 = vmNode('am-deleted-2')
    const result = ensureAccessModelNodes([stale1, stale2], accessModels)

    expect(result.nodes).toEqual([])
    expect(result.removedVmIds).toEqual(['am-deleted-1', 'am-deleted-2'])
  })

  it('accessModels 缩短时混合 ADD + REMOVE（既有节点保留，缺的补齐，多余的剔除）', () => {
    const keep = vmNode('am-keep')
    const stale = vmNode('am-stale')
    const accessModels = [
      { id: 'am-keep', name: 'keep', displayName: null },
      { id: 'am-new', name: 'new', displayName: null },
    ]
    const result = ensureAccessModelNodes([keep, stale], accessModels)

    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.find((n) => n.id === 'vm-am-keep')).toBe(keep)
    expect(result.nodes.find((n) => n.id === 'vm-am-new')).toBeDefined()
    expect(result.removedVmIds).toEqual(['am-stale'])
  })

  it('禁用（enabled=false）的接入模型对应 vm 节点也剔除', () => {
    const accessModels = [{ id: 'am-active', name: 'active', displayName: null, enabled: false }]
    const result = ensureAccessModelNodes([vmNode('am-active')], accessModels)

    expect(result.nodes).toEqual([])
    expect(result.removedVmIds).toEqual(['am-active'])
  })
})
