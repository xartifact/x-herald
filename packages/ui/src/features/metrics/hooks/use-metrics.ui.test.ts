import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { waitFor } from '@testing-library/dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useInstancesSummary, useInstanceTimeseries, useProviderQuality } from './use-metrics'

vi.mock('../../../shared/lib/api-client', () => ({
  get: vi.fn(),
  post: vi.fn(),
  patch: vi.fn(),
}))

import { get } from '@xartifact/x-herald-ui'

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  })

  return function Wrapper({ children }: { children: React.ReactNode }) {
    return React.createElement(QueryClientProvider, { client: queryClient }, children)
  }
}

const wrapperResponse = { data: [{ instanceId: 'i-1', instanceName: 'inst-1' }] }

describe('metrics hooks wrapper shape contract', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('useInstancesSummary keeps wrapper shape (extractData: false)', async () => {
    vi.mocked(get).mockResolvedValue(wrapperResponse)

    const { result } = renderHook(() => useInstancesSummary(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(get).toHaveBeenCalledWith('/api/metrics/instances', { extractData: false })
    expect(result.current.data).toEqual(wrapperResponse)
  })

  it('useProviderQuality keeps wrapper shape (extractData: false)', async () => {
    vi.mocked(get).mockResolvedValue(wrapperResponse)

    const { result } = renderHook(() => useProviderQuality(), { wrapper: createWrapper() })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(get).toHaveBeenCalledWith('/api/metrics/providers/quality', {
      extractData: false,
    })
    expect(result.current.data).toEqual(wrapperResponse)
  })

  it('useInstanceTimeseries keeps wrapper shape (extractData: false)', async () => {
    vi.mocked(get).mockResolvedValue({
      instanceId: 'i-1',
      period: '6h',
      data: [{ bucketStart: '2026-01-01' }],
      baseline: null,
    })

    const { result } = renderHook(() => useInstanceTimeseries('i-1'), {
      wrapper: createWrapper(),
    })

    await waitFor(() => expect(result.current.isLoading).toBe(false))

    expect(get).toHaveBeenCalledWith('/api/metrics/instances/i-1/timeseries?period=6h', {
      extractData: false,
    })
    expect(result.current.data?.data).toHaveLength(1)
  })
})
