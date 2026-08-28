import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SyncModelsDialog } from './sync-models-dialog'

// Mock 数据 hooks：让组件可离线渲染（React Query 内部结构不在此验证）。
vi.mock('../hooks/use-providers', () => ({
  useProviderModels: vi.fn(),
  useSyncProviderModels: () => ({ isPending: false, mutateAsync: vi.fn(), mutate: vi.fn() }),
}))
vi.mock('../../model-groups', () => ({
  useModelGroups: () => ({ data: [] }),
}))

import { useProviderModels } from '../hooks/use-providers'

const mockedUseProviderModels = vi.mocked(useProviderModels)

describe('SyncModelsDialog', () => {
  beforeEach(() => {
    mockedUseProviderModels.mockReset()
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
})
