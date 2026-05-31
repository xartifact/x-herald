import { describe, test, expect, mock, beforeEach } from 'bun:test'

const basePath = '/home/binzhan/Workspaces/github/xartifact/x-llm-gateway/packages/ui/src'

// SettingsData mock
import type { SettingsData } from '@x-llm-gateway/engine'

const mockSettingsData: SettingsData = {
  aiModelGroupId: 'test-group',
  availableModelGroups: [],
  circuitBreaker: { failureThreshold: 3, openDurationMs: 60_000, maxBackoffMs: 300_000, maxTripsBeforeCooldown: 5, cooldownDurationMs: 1_800_000 },
}

// Track mock calls
const mockGet = mock(() => Promise.resolve({ success: true, data: mockSettingsData }))
const mockPut = mock(() => Promise.resolve({ success: true }))
const mockPost = mock(() => Promise.resolve({ summary: { providers: { created: 1, updated: 0 } }, errors: [] }))
const mockInvalidateQueries = mock(() => Promise.resolve())
const mockToastSuccess = mock(() => {})
const mockToastError = mock(() => {})

// Mock modules BEFORE importing hooks
mock.module(`${basePath}/lib/api-client.ts`, () => ({
  get: mockGet,
  put: mockPut,
  post: mockPost,
}))

mock.module('@tanstack/react-query', () => ({
  useQuery: mock((options) => {
    if (options.queryFn) {
      options.queryFn().catch(() => {})
    }
    return {
      data: mockSettingsData,
      isLoading: false,
      isError: false,
      error: null,
    }
  }),
  useMutation: mock((options) => {
    return {
      mutate: mock((data: any, mutateOptions?: any) => {
        if (options.mutationFn) {
          options.mutationFn(data)
            .then((result: any) => {
              if (options.onSuccess) options.onSuccess(result, data, {})
              if (mutateOptions?.onSuccess) mutateOptions.onSuccess(result)
            })
            .catch((err: any) => {
              if (options.onError) options.onError(err, data, {})
              if (mutateOptions?.onError) mutateOptions.onError(err)
            })
        }
      }),
      mutateAsync: mock((data: any) => {
        if (options.mutationFn) {
          return options.mutationFn(data)
        }
        return Promise.resolve()
      }),
      isPending: false,
      isError: false,
      error: null,
      data: undefined,
    }
  }),
  useQueryClient: mock(() => ({
    invalidateQueries: mockInvalidateQueries,
  })),
}))

mock.module('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
  },
}))

import { useSettings, useUpdateSettings } from '../use-settings'
import { useExportConfig, useImportConfig } from '../use-config-io'

describe('useSettings hook', () => {
  beforeEach(() => {
    mockGet.mockClear()
  })

  test('calls useQuery with correct queryKey', () => {
    const result = useSettings()
    expect(result.data).toEqual(mockSettingsData)
    expect(result.isLoading).toBe(false)
  })
})

describe('useUpdateSettings hook', () => {
  beforeEach(() => {
    mockPut.mockClear()
    mockToastSuccess.mockClear()
    mockToastError.mockClear()
    mockInvalidateQueries.mockClear()
  })

  test('mutate calls put with correct endpoint and data', async () => {
    const mutation = useUpdateSettings()
    const testData = { aiModelGroupId: 'new-group' }

    mutation.mutate(testData)

    // Allow promise to resolve
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockPut).toHaveBeenCalledWith('/api/settings', testData, { extractData: false })
  })

  test('onSuccess invalidates settings query and shows toast', async () => {
    const mutation = useUpdateSettings()

    mutation.mutate({ aiModelGroupId: 'new-group' })
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockToastSuccess).toHaveBeenCalledWith('设置已更新', {
      description: '配置已生效，无需重启服务',
    })
    expect(mockInvalidateQueries).toHaveBeenCalledWith({ queryKey: ['settings'] })
  })

  test('onError shows error toast when update fails', async () => {
    mockPut.mockReturnValueOnce(Promise.resolve({ success: false }))
    const mutation = useUpdateSettings()

    mutation.mutate({ aiModelGroupId: 'new-group' })
    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockToastError).toHaveBeenCalled()
  })
})

describe('useExportConfig hook', () => {
  beforeEach(() => {
    mockToastSuccess.mockClear()
    mockToastError.mockClear()
  })

  test('exportConfigFn uses raw fetch for blob download', async () => {
    // Mock fetch for blob download
    const mockBlob = new Blob(['test config'], { type: 'application/json' })
    const mockFetch = mock(() =>
      Promise.resolve({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      } as unknown as Response)
    )
    global.fetch = mockFetch as unknown as typeof fetch

    const mutation = useExportConfig()
    mutation.mutate()

    await new Promise((resolve) => setTimeout(resolve, 10))

    expect(mockFetch).toHaveBeenCalledWith('/api/config/export', expect.objectContaining({
      headers: expect.any(Object),
    }))

    // Cleanup
    // @ts-ignore
    delete global.fetch
  })
})

describe('useImportConfig hook', () => {
  beforeEach(() => {
    mockPost.mockClear()
    mockToastError.mockClear()
  })

  test('importConfigFn parses JSON file and calls post endpoint', async () => {
    const mockFile = {
      text: () => Promise.resolve('{"providers": [], "modelGroups": []}'),
    } as File

    const mutation = useImportConfig()
    await mutation.mutateAsync(mockFile)

    expect(mockPost).toHaveBeenCalledWith(
      '/api/config/import',
      expect.objectContaining({ providers: [], modelGroups: [] })
    )
  })

  test('throws error for invalid JSON file', async () => {
    const mockFile = {
      text: () => Promise.resolve('not valid json'),
    } as File

    const mutation = useImportConfig()

    try {
      await mutation.mutateAsync(mockFile)
      expect(false).toBe(true) // Should not reach here
    } catch (error: any) {
      expect(error.message).toContain('JSON')
    }
  })
})
