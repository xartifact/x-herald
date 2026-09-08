import { describe, expect, it } from 'vitest'
import type { ModelGroup } from '@xartifact/x-herald-shared'

import { resolveGroupLabel, toGroupMultiSelectOptions } from './group-options'

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

describe('resolveGroupLabel', () => {
  it('优先使用 displayName', () => {
    expect(resolveGroupLabel({ name: 'gpt-4-group', displayName: 'GPT-4 生产组' })).toBe(
      'GPT-4 生产组',
    )
  })

  it('displayName 为 null 时回退到 name', () => {
    expect(resolveGroupLabel({ name: 'gpt-4-group', displayName: null })).toBe('gpt-4-group')
  })

  it('displayName 为空字符串时回退到 name', () => {
    expect(resolveGroupLabel({ name: 'gpt-4-group', displayName: '' })).toBe('gpt-4-group')
  })
})

describe('toGroupMultiSelectOptions', () => {
  it('把模型组转换为 value/label/disabled 三元组', () => {
    const groups = [
      group({ id: 'g1', name: 'group-a', displayName: 'Group A', enabled: true }),
      group({ id: 'g2', name: 'group-b', displayName: '', enabled: false }),
    ]

    expect(toGroupMultiSelectOptions(groups)).toEqual([
      { value: 'g1', label: 'Group A', disabled: false },
      { value: 'g2', label: 'group-b', disabled: true },
    ])
  })

  it('空数组返回空数组', () => {
    expect(toGroupMultiSelectOptions([])).toEqual([])
  })
})
