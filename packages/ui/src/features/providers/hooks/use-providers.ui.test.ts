import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useProviders } from './use-providers'

vi.mock('../../../shared/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  patch: vi.fn(),
}))

import { get } from '../../../shared/lib/api-client'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const mockProviders = [
  {
    id: '1',
    name: 'OpenAI',
    apiKey: 'sk-test',
    protocols: { openai: { enabled: true, baseUrl: 'https://api.openai.com/v1' } },
    enabled: true,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: '2',
    name: 'Anthropic',
    apiKey: null,
    protocols: { anthropic: { enabled: true, baseUrl: 'https://api.anthropic.com/v1' } },
    enabled: false,
    createdAt: '2024-01-02',
    updatedAt: '2024-01-02',
  },
]

describe('useProviders', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns loading state initially', () => {
    vi.mocked(get).mockResolvedValue(mockProviders)

    const { result } = renderHook(() => useProviders(), { wrapper: createWrapper() })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('returns data after fetch resolves', async () => {
    vi.mocked(get).mockResolvedValue(mockProviders)

    const { result } = renderHook(() => useProviders(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).toEqual(mockProviders)
    expect(result.current.error).toBeNull()
  })

  it('returns error on fetch failure', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useProviders(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeDefined()
    expect(result.current.data).toBeUndefined()
  })

  it('calls get with correct endpoint', async () => {
    vi.mocked(get).mockResolvedValue(mockProviders)

    renderHook(() => useProviders(), { wrapper: createWrapper() })

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/providers'))
  })
})
