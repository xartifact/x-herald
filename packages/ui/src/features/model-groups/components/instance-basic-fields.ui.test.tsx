import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'

import type { ModelGroup, Provider } from '@xartifact/x-herald-shared'
import { Form } from '../../../shared/components/ui/form'
import { InstanceBasicFields } from './instance-basic-fields'

function provider(overrides: Partial<Provider> = {}): Provider {
  return {
    id: 'p1',
    name: 'OpenAI',
    apiKey: null,
    protocols: {},
    enabled: true,
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

function TestWrapper({ groups }: { groups: ModelGroup[] }) {
  const form = useForm<Record<string, unknown>>({
    defaultValues: { providerId: '', name: '', actualModelName: '', weight: 0, groupIds: [] },
  })
  return (
    <Form {...form}>
      <form>
        <InstanceBasicFields form={form} providers={[provider()]} groups={groups} />
      </form>
    </Form>
  )
}

describe('InstanceBasicFields - 加入的模型组', () => {
  it('未传入 groups 时不渲染该字段', () => {
    render(<TestWrapper groups={[]} />)
    expect(screen.queryByText('加入的模型组')).not.toBeInTheDocument()
  })

  it('打开选择器后展示所有模型组，禁用组标注"已禁用"', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        groups={[
          group({ id: 'g1', name: 'group-a', displayName: 'Group A', enabled: true }),
          group({ id: 'g2', name: 'group-b', displayName: '', enabled: false }),
        ]}
      />,
    )

    expect(screen.getByText('加入的模型组')).toBeInTheDocument()

    const trigger = screen.getByText('选择模型组...')
    await user.click(trigger)

    expect(screen.getByText('Group A')).toBeInTheDocument()
    expect(screen.getByText('group-b')).toBeInTheDocument()
    expect(screen.getByText('已禁用')).toBeInTheDocument()
  })

  it('选中一个启用的组后，触发器回显其名称', async () => {
    const user = userEvent.setup()
    render(
      <TestWrapper
        groups={[group({ id: 'g1', name: 'group-a', displayName: 'Group A', enabled: true })]}
      />,
    )

    await user.click(screen.getByText('选择模型组...'))
    await user.click(screen.getByText('Group A'))

    expect(screen.getAllByText('Group A').length).toBeGreaterThan(0)
  })
})
