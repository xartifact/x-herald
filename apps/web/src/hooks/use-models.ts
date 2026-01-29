/**
 * Model 相关的 Query Hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del } from '@/lib/api-client'
import type { Model } from '@/lib/types'
import { toast } from 'sonner'

// Query Keys
export const modelKeys = {
  all: ['models'] as const,
  lists: () => [...modelKeys.all, 'list'] as const,
  list: (filters: string) => [...modelKeys.lists(), { filters }] as const,
  details: () => [...modelKeys.all, 'detail'] as const,
  detail: (id: string) => [...modelKeys.details(), id] as const,
}

/**
 * 获取模型列表
 */
export function useModels() {
  return useQuery({
    queryKey: modelKeys.lists(),
    queryFn: () => get<Model[]>('/api/models'),
  })
}

/**
 * 创建模型
 */
export function useCreateModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      displayName: string
      actualModelName: string
      providerId: string
      enabled?: boolean
      routingConfig: Model['routingConfig']
      protocolConversion: Model['protocolConversion']
    }) => post<Model>('/api/models', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelKeys.lists() })
      toast.success('模型创建成功')
    },
    onError: (error: any) => {
      toast.error(error.data?.error || '创建失败')
    },
  })
}

/**
 * 更新模型
 */
export function useUpdateModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string
        displayName?: string
        actualModelName?: string
        providerId?: string
        enabled?: boolean
        routingConfig?: Model['routingConfig']
        protocolConversion?: Model['protocolConversion']
      }
    }) => put<Model>(`/api/models/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: modelKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelKeys.detail(variables.id) })
      toast.success('模型更新成功')
    },
    onError: (error: any) => {
      toast.error(error.data?.error || '更新失败')
    },
  })
}

/**
 * 删除模型
 */
export function useDeleteModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => del<void>(`/api/models/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelKeys.lists() })
      toast.success('模型删除成功')
    },
    onError: (error: any) => {
      toast.error(error.data?.error || '删除失败')
    },
  })
}
