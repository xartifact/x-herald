import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ProviderCardBody } from './provider-card-body'
import type { ModelInstance } from '@xartifact/x-herald-shared'

vi.mock('../../model-groups/components/instance-test-button', () => ({
  InstanceTestButton: () => <button type="button">测试实例</button>,
}))

const provider = {
  id: 'provider-1',
  name: 'Test Provider',
  apiKey: null,
  protocols: {},
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const handlers = {
  onAdd: vi.fn(),
  onEdit: vi.fn(),
  onDelete: vi.fn(),
  onToggle: vi.fn(),
  getGroupName: () => '-',
}

function renderBody(
  instancesLoading: boolean,
  instancesError: unknown,
  refetchInstances = vi.fn(),
) {
  return {
    refetchInstances,
    ...render(
      <ProviderCardBody
        provider={provider}
        instances={[] as ModelInstance[]}
        instancesLoading={instancesLoading}
        instancesError={instancesError}
        refetchInstances={refetchInstances}
        showApiKey={false}
        onToggleShowApiKey={vi.fn()}
        instanceHandlers={handlers}
      />,
    ),
  }
}
const instance: ModelInstance = {
  id: 'instance-1',
  providerId: 'provider-1',
  name: 'Primary production model',
  actualModelName: 'gpt-4.1-long-context',
  enabled: true,
  weight: 100,
  groupIds: ['group-1'],
  groupPriorities: { 'group-1': 0 },
  config: {},
  costPer1kTokens: { input: 1, output: 2 },
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('ProviderCardBody instance query state', () => {
  it('renders readable mobile cards and keeps the desktop table and instance actions available', () => {
    render(
      <ProviderCardBody
        provider={provider}
        instances={[instance]}
        instancesLoading={false}
        instancesError={null}
        refetchInstances={vi.fn()}
        showApiKey={false}
        onToggleShowApiKey={vi.fn()}
        instanceHandlers={handlers}
      />,
    )

    expect(screen.getAllByText('Primary production model')).toHaveLength(2)
    expect(screen.getAllByText('gpt-4.1-long-context')).toHaveLength(2)
    expect(screen.getByText('模型组')).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('button', { name: '编辑 Primary production model' })).toHaveLength(2)
    expect(screen.getAllByRole('button', { name: '删除 Primary production model' })).toHaveLength(2)
  })

  it('does not display an empty table while instances are loading', () => {
    renderBody(true, null)

    expect(screen.getByRole('status')).toHaveTextContent('加载实例中...')
    expect(screen.queryByText('暂无实例')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('displays instance errors instead of empty results and retries the query', () => {
    const refetchInstances = vi.fn()
    renderBody(false, new Error('instance fetch failed'), refetchInstances)

    expect(screen.getByRole('alert')).toHaveTextContent('无法加载实例。')
    expect(screen.queryByText('暂无实例')).not.toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '重试' }))
    expect(refetchInstances).toHaveBeenCalledOnce()
  })
})
