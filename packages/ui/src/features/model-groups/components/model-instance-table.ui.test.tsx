import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

import type { ModelInstance } from '@xartifact/x-herald-shared'
import { ModelInstanceTable, resolveReorder } from './model-instance-table'

vi.mock('../hooks', () => ({
  useTestInstance: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('../../ai-assist', () => ({
  InstanceAiChat: () => <button type="button">AI</button>,
}))

function instance(id: string, name: string): ModelInstance {
  return {
    id,
    providerId: 'p1',
    name,
    actualModelName: 'gpt-4-turbo',
    description: null,
    config: null,
    weight: 1,
    costPer1kTokens: null,
    healthCheckUrl: null,
    enabled: true,
    status: 'healthy',
    lastCheckedAt: null,
    metadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

function setup(instances: ModelInstance[], onReorder = vi.fn()) {
  render(
    <ModelInstanceTable
      instances={instances}
      getProviderName={() => 'OpenAI'}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onToggle={vi.fn()}
      onReorder={onReorder}
    />,
  )
  return onReorder
}

describe('resolveReorder - 拖拽落定顺序解析', () => {
  const ids = ['a', 'b', 'c']

  it('把 active 移到 over 位置', () => {
    expect(resolveReorder(ids, 'a', 'c')).toEqual(['b', 'c', 'a'])
    expect(resolveReorder(ids, 'c', 'a')).toEqual(['c', 'a', 'b'])
  })

  it('原地放置返回 null，不提交', () => {
    expect(resolveReorder(ids, 'b', 'b')).toBeNull()
  })

  it('无落点返回 null', () => {
    expect(resolveReorder(ids, 'a', undefined)).toBeNull()
  })

  it('未知 id 返回 null', () => {
    expect(resolveReorder(ids, 'a', 'ghost')).toBeNull()
  })
})

describe('ModelInstanceTable - 拖拽排序', () => {
  it('渲染拖拽把手且行按传入顺序显示序号', () => {
    setup([instance('i1', 'a'), instance('i2', 'b')])

    expect(screen.getByLabelText('拖拽调整 a 顺序')).toBeInTheDocument()
    expect(screen.getByLabelText('拖拽调整 b 顺序')).toBeInTheDocument()
    expect(screen.getByTestId('instance-row-i1')).toBeInTheDocument()
    expect(screen.getByTestId('instance-row-i2')).toBeInTheDocument()
  })

  it('空实例列表显示占位文案', () => {
    render(
      <ModelInstanceTable
        instances={[]}
        getProviderName={() => 'OpenAI'}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
        onToggle={vi.fn()}
        onReorder={vi.fn()}
      />,
    )
    expect(screen.getByText('暂无实例')).toBeInTheDocument()
  })
})
