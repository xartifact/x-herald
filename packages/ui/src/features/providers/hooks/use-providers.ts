/**
 * Provider 相关的 Query Hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post, put, del, patch } from '@xartifact/x-llm-gateway-ui'

import type { Provider, ProtocolsConfig } from '@xartifact/x-llm-gateway-shared'

// Query Keys
export const providerKeys = {
  all: ['providers'] as const,
  lists: () => [...providerKeys.all, 'list'] as const,
  list: (filters: string) => [...providerKeys.lists(), { filters }] as const,
  details: () => [...providerKeys.all, 'detail'] as const,
  detail: (id: string) => [...providerKeys.details(), id] as const,
}

/**
 * 获取供应商列表
 */
export function useProviders() {
  return useQuery({
    queryKey: providerKeys.lists(),
    queryFn: () => get<Provider[]>('/api/providers'),
  })
}

/**
 * 获取单个供应商
 */
export function useProvider(id: string) {
  return useQuery({
    queryKey: providerKeys.detail(id),
    queryFn: () => get<Provider>(`/api/providers/${id}`),
    enabled: !!id,
  })
}

/**
 * 创建供应商
 */
export function useCreateProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      apiKey?: string
      protocols: ProtocolsConfig
      enabled?: boolean
    }) => post<Provider>('/api/providers', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
      toast.success('供应商创建成功')
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '创建失败')
    },
  })
}

/**
 * 更新供应商
 */
export function useUpdateProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Provider> }) =>
      put<Provider>(`/api/providers/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
      queryClient.invalidateQueries({ queryKey: providerKeys.detail(variables.id) })
      toast.success('供应商更新成功')
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '更新失败')
    },
  })
}

/**
 * 获取供应商远程模型列表
 */
export function useProviderModels(providerId: string, enabled = false) {
  return useQuery({
    queryKey: [...providerKeys.detail(providerId), 'models'] as const,
    queryFn: () =>
      get<{ id: string; name: string; synced: boolean }[]>(`/api/providers/${providerId}/models`),
    enabled: !!providerId && enabled,
  })
}

/**
 * 批量同步供应商模型
 */
export function useSyncProviderModels() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({
      providerId,
      models,
      groupId,
    }: {
      providerId: string
      models: Array<{ id: string; name: string }>
      groupId?: string
    }) =>
      post<{ created: number; skipped: number }>(`/api/providers/${providerId}/sync-models`, {
        models,
        groupId,
      }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
      // 同时刷新 model-groups 的 instances
      queryClient.invalidateQueries({ queryKey: ['model-groups', 'instances'] })
      const result = data as unknown as { created: number; skipped: number }
      toast.success(`同步完成：新增 ${result.created} 个，跳过 ${result.skipped} 个`)
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '同步失败')
    },
  })
}

/**
 * 删除供应商
 */
export function useDeleteProvider() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => del<void>(`/api/providers/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
      toast.success('供应商删除成功')
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '删除失败')
    },
  })
}

export function useToggleProvider() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => patch<Provider>(`/api/providers/${id}/toggle`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: providerKeys.lists() })
    },
    onError: () => {
      toast.error('切换状态失败')
    },
  })
}
