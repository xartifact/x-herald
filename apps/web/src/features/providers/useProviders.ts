/**
 * Provider 相关的 Query Hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del } from '@/core/lib/api-client'
import type { Provider, ProtocolsConfig } from './types'
import { toast } from 'sonner'

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
