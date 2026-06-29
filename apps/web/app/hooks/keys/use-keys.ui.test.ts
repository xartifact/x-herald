import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useKeys } from './use-keys'

vi.mock('../../../shared/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  del: vi.fn(),
  patch: vi.fn(),
}))

import { get } from '@xartifact/x-llm-gateway-ui'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const mockKeys = [
  {
    id: '1',
    key: 'sk-test-123',
    name: 'Production Key',
    allowedModels: ['gpt-4'],
    rateLimitRpm: 60,
    rateLimitRpd: 1000,
    tokenLimitDaily: null,
    enabled: true,
    expiresAt: null,
    createdAt: '2024-01-01',
    updatedAt: '2024-01-01',
  },
  {
    id: '2',
    key: 'sk-test-456',
    name: 'Development Key',
    allowedModels: null,
    rateLimitRpm: null,
    rateLimitRpd: null,
    tokenLimitDaily: null,
    enabled: false,
    expiresAt: '2025-12-31',
    createdAt: '2024-01-02',
    updatedAt: '2024-01-02',
  },
]

describe('useKeys', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns loading state initially', () => {
    vi.mocked(get).mockResolvedValue(mockKeys)

    const { result } = renderHook(() => useKeys(), { wrapper: createWrapper() })

    expect(result.current.isLoading).toBe(true)
    expect(result.current.data).toBeUndefined()
  })

  it('returns data after fetch resolves', async () => {
    vi.mocked(get).mockResolvedValue(mockKeys)

    const { result } = renderHook(() => useKeys(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(result.current.data).toEqual(mockKeys)
    expect(result.current.error).toBeNull()
  })

  it('returns error on fetch failure', async () => {
    vi.mocked(get).mockRejectedValue(new Error('Network error'))

    const { result } = renderHook(() => useKeys(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isError).toBe(true))

    expect(result.current.error).toBeDefined()
    expect(result.current.data).toBeUndefined()
  })

  it('calls get with correct endpoint', async () => {
    vi.mocked(get).mockResolvedValue(mockKeys)

    renderHook(() => useKeys(), { wrapper: createWrapper() })

    await waitFor(() => expect(get).toHaveBeenCalledWith('/api/keys'))
  })
})
