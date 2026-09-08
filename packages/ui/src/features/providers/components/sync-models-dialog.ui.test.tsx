import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SyncModelsDialog } from './sync-models-dialog'

// Mock 数据 hooks：让组件可离线渲染（React Query 内部结构不在此验证）。
// toGroupMultiSelectOptions 不 mock：走真实实现，验证"绑定模型组"多选真实可用。
vi.mock('../hooks/use-providers', () => ({
  useProviderModels: vi.fn(),
  useSyncProviderModels: () => ({ isPending: false, mutateAsync: vi.fn(), mutate: vi.fn() }),
}))
vi.mock('../../model-groups', async () => {
  const actual = await vi.importActual<typeof import('../../model-groups')>('../../model-groups')
  return {
    ...actual,
    useModelGroups: vi.fn(() => ({ data: [] })),
  }
})

import { useProviderModels } from '../hooks/use-providers'
import { useModelGroups } from '../../model-groups'

const mockedUseProviderModels = vi.mocked(useProviderModels)
const mockedUseModelGroups = vi.mocked(useModelGroups)

describe('SyncModelsDialog', () => {
  beforeEach(() => {
    mockedUseProviderModels.mockReset()
    mockedUseModelGroups.mockReturnValue({ data: [] } as never)
  })

  it('renders models when fetch succeeds without fetchError', () => {
    mockedUseProviderModels.mockReturnValue({
      data: { data: [{ id: 'gpt-4o', name: 'gpt-4o' }], total: 1, fetchError: null },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    render(<SyncModelsDialog providerId="p1" providerName="bai" open onOpenChange={vi.fn()} />)

    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.queryByText(/无法获取模型列表/)).not.toBeInTheDocument()
  })

  it('shows error banner with fetchError when upstream fails and no models', () => {
    mockedUseProviderModels.mockReturnValue({
      data: { data: [], total: 0, fetchError: 'unknown certificate verification error' },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    render(<SyncModelsDialog providerId="p1" providerName="bai" open onOpenChange={vi.fn()} />)

    expect(screen.getByText('无法获取模型列表')).toBeInTheDocument()
    expect(screen.getByText(/unknown certificate verification error/)).toBeInTheDocument()
  })

  it('does not show error banner when models recovered alongside a stale fetchError', () => {
    mockedUseProviderModels.mockReturnValue({
      data: { data: [{ id: 'qwen-max', name: 'qwen-max' }], total: 1, fetchError: 'old error' },
      isLoading: false,
      refetch: vi.fn(),
    } as never)

    render(<SyncModelsDialog providerId="p1" providerName="bai" open onOpenChange={vi.fn()} />)

    expect(screen.getByText('qwen-max')).toBeInTheDocument()
    expect(screen.queryByText(/无法获取模型列表/)).not.toBeInTheDocument()
  })

  it('refetches models via banner retry button', () => {
    const refetch = vi.fn()
    mockedUseProviderModels.mockReturnValue({
      data: { data: [], total: 0, fetchError: 'boom' },
      isLoading: false,
      refetch,
    } as never)

    render(<SyncModelsDialog providerId="p1" providerName="bai" open onOpenChange={vi.fn()} />)

    const retryButtons = screen.getAllByRole('button', { name: '重试' })
    fireEvent.click(retryButtons[0])
    expect(refetch).toHaveBeenCalled()
  })

  it('传入真实模型组数据时展示"绑定模型组"多选（不 mock toGroupMultiSelectOptions）', () => {
    mockedUseProviderModels.mockReturnValue({
      data: { data: [{ id: 'gpt-4o', name: 'gpt-4o' }], total: 1, fetchError: null },
      isLoading: false,
      refetch: vi.fn(),
    } as never)
    mockedUseModelGroups.mockReturnValue({
      data: [
        {
          id: 'g1',
          name: 'group-a',
          aliases: null,
          displayName: 'Group A',
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
        },
      ],
    } as never)

    render(<SyncModelsDialog providerId="p1" providerName="bai" open onOpenChange={vi.fn()} />)

    // 弹出层内容依赖 Radix Popover 嵌套在 Dialog 内的定位逻辑，jsdom 下不稳定，
    // 这里只验证真实 useModelGroups 数据经真实 toGroupMultiSelectOptions 后，
    // 触发器正常挂载且未崩溃（此前该分支被永久 mock 为空数组，从未被执行过）。
    expect(screen.getByText('绑定模型组：')).toBeInTheDocument()
    expect(screen.getByText('不绑定（可多选）')).toBeInTheDocument()
  })
})
