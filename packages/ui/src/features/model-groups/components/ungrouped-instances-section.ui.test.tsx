import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { ModelGroup, ModelInstance } from '@xartifact/x-herald-shared'
import { UngroupedInstancesSection } from './ungrouped-instances-section'

vi.mock('../hooks/use-model-groups', () => ({
  useSetInstanceGroups: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useToggleModelInstance: () => ({ mutate: vi.fn() }),
}))

function instance(overrides: Partial<ModelInstance> = {}): ModelInstance {
  return {
    id: 'i1',
    providerId: 'p1',
    name: 'instance-a',
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
    ...overrides,
  }
}

function group(overrides: Partial<ModelGroup> = {}): ModelGroup {
  return {
    id: 'g1',
    name: 'default-group',
    aliases: null,
    displayName: '',
    description: null,
    category: 'chat',
    capabilities: {
      streaming: true,
      functionCalling: false,
      vision: false,
      jsonMode: false,
      maxTokens: 4096,
      contextWindow: 8192,
    },
    supportedProtocols: null,
    enabled: true,
    routingConfig: null,
    metadata: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  }
}

describe('UngroupedInstancesSection - 分配到组', () => {
  it('无未分组实例时不渲染', () => {
    const { container } = render(
      <UngroupedInstancesSection instances={[]} groups={[]} getProviderName={() => 'OpenAI'} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('打开分配选择器后展示所有模型组，禁用组标注"已禁用"', async () => {
    const user = userEvent.setup()
    render(
      <UngroupedInstancesSection
        instances={[instance()]}
        groups={[
          group({ id: 'g1', name: 'group-a', displayName: 'Group A', enabled: true }),
          group({ id: 'g2', name: 'group-b', displayName: '', enabled: false }),
        ]}
        getProviderName={() => 'OpenAI'}
      />,
    )

    expect(screen.getByText('instance-a')).toBeInTheDocument()

    await user.click(screen.getByText('选择模型组...'))

    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.getByText('group-b')).toBeInTheDocument()
    expect(screen.getByText('已禁用')).toBeInTheDocument()
  })
})
