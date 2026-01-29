import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del as deleteRequest, patch } from '@/core/lib/api-client'
import { toast } from 'sonner'
import type { ModelGroup, ModelInstance, ModelGroupDetail, ApiResponse } from './types'

// 查询键
export const modelGroupKeys = {
  all: ['model-groups'] as const,
  lists: () => [...modelGroupKeys.all, 'list'] as const,
  list: (filters: string) => [...modelGroupKeys.lists(), { filters }] as const,
  details: () => [...modelGroupKeys.all, 'detail'] as const,
  detail: (id: string) => [...modelGroupKeys.details(), id] as const,
}

// 获取所有模型组
export function useModelGroups() {
  return useQuery({
    queryKey: modelGroupKeys.lists(),
    queryFn: async () => {
      const data = await get<ApiResponse<ModelGroup[]>>('/api/model-groups')
      if (!data.success) {
        throw new Error(data.error || '获取模型组失败')
      }
      return data.data
    },
  })
}

// 获取单个模型组详情
export function useModelGroup(id: string) {
  return useQuery({
    queryKey: modelGroupKeys.detail(id),
    queryFn: async () => {
      const data = await get<ApiResponse<ModelGroupDetail>>(`/api/model-groups/${id}`)
      if (!data.success) {
        throw new Error(data.error || '获取模型组详情失败')
      }
      return data.data
    },
    enabled: !!id,
  })
}

// 创建模型组
export function useCreateModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      name: string
      displayName: string
      description?: string
      category?: string
      capabilities?: ModelGroup['capabilities']
      routingConfig?: ModelGroup['routingConfig']
      supportedProtocols?: string[]
      metadata?: Record<string, unknown>
    }) => {
      const response = await post<ApiResponse<ModelGroup>>('/api/model-groups', data)
      if (!response.success) {
        throw new Error(response.error || '创建模型组失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.lists() })
      toast.success('模型组创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// 更新模型组
export function useUpdateModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      data,
    }: {
      id: string
      data: Partial<{
        name: string
        displayName: string
        description: string
        category: string
        capabilities: ModelGroup['capabilities']
        routingConfig: ModelGroup['routingConfig']
        supportedProtocols: string[]
        metadata: Record<string, unknown>
      }>
    }) => {
      const response = await put<ApiResponse<ModelGroup>>(`/api/model-groups/${id}`, data)
      if (!response.success) {
        throw new Error(response.error || '更新模型组失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.detail(variables.id) })
      toast.success('模型组更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// 删除模型组
export function useDeleteModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteRequest<ApiResponse<ModelGroup>>(`/api/model-groups/${id}`)
      if (!response.success) {
        throw new Error(response.error || '删除模型组失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.lists() })
      toast.success('模型组删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// 切换模型组启用状态
export function useToggleModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await patch<ApiResponse<ModelGroup>>(`/api/model-groups/${id}/toggle`)
      if (!response.success) {
        throw new Error(response.error || '切换状态失败')
      }
      return response.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.detail(id) })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// ==================== 模型实例 Hooks ====================

// 创建模型实例
export function useCreateModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: {
      groupId: string
      providerId: string
      name: string
      actualModelName: string
      description?: string
      weight?: number
      priority?: number
      costPer1kTokens?: {
        input: number
        output: number
      }
      config?: ModelInstance['config']
    }) => {
      const response = await post<ApiResponse<ModelInstance>>('/api/model-groups/instances', data)
      if (!response.success) {
        throw new Error(response.error || '创建模型实例失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.detail(variables.groupId) })
      toast.success('模型实例创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// 更新模型实例
export function useUpdateModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({
      id,
      groupId,
      data,
    }: {
      id: string
      groupId: string
      data: Partial<{
        name: string
        actualModelName: string
        description: string
        weight: number
        priority: number
        costPer1kTokens: {
          input: number
          output: number
        }
        config: ModelInstance['config']
      }>
    }) => {
      const response = await put<ApiResponse<ModelInstance>>(`/api/model-groups/instances/${id}`, data)
      if (!response.success) {
        throw new Error(response.error || '更新模型实例失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.detail(variables.groupId) })
      toast.success('模型实例更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// 删除模型实例
export function useDeleteModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId: string }) => {
      const response = await deleteRequest<ApiResponse<ModelInstance>>(`/api/model-groups/instances/${id}`)
      if (!response.success) {
        throw new Error(response.error || '删除模型实例失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.detail(variables.groupId) })
      toast.success('模型实例删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// 切换模型实例启用状态
export function useToggleModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, groupId }: { id: string; groupId: string }) => {
      const response = await patch<ApiResponse<ModelInstance>>(`/api/model-groups/instances/${id}/toggle`)
      if (!response.success) {
        throw new Error(response.error || '切换状态失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.detail(variables.groupId) })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
