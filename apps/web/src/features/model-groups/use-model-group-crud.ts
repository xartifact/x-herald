import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post, put, del as deleteRequest, patch } from '@/core/lib/api-client'

import type { ModelGroup, ModelGroupDetail, ApiResponse, RoutingConfig } from './types'

export const modelGroupKeys = {
  all: ['model-groups'] as const,
  lists: () => [...modelGroupKeys.all, 'list'] as const,
  list: (filters: string) => [...modelGroupKeys.lists(), { filters }] as const,
  details: () => [...modelGroupKeys.all, 'detail'] as const,
  detail: (id: string) => [...modelGroupKeys.details(), id] as const,
  instances: () => [...modelGroupKeys.all, 'instances'] as const,
}

export function useModelGroups() {
  return useQuery({
    queryKey: modelGroupKeys.lists(),
    queryFn: async () => {
      const response = await get<ApiResponse<ModelGroup[]>>('/api/model-groups', { extractData: false })
      if (!response.success) throw new Error(response.error || '获取模型组失败')
      return response.data
    },
  })
}

export function useModelGroup(id: string) {
  return useQuery({
    queryKey: modelGroupKeys.detail(id),
    queryFn: async () => {
      const response = await get<ApiResponse<ModelGroupDetail>>(`/api/model-groups/${id}`, { extractData: false })
      if (!response.success) throw new Error(response.error || '获取模型组详情失败')
      return response.data
    },
    enabled: !!id,
  })
}

interface CreateModelGroupData {
  name: string
  displayName: string
  description?: string
  category?: string
  capabilities?: ModelGroup['capabilities']
  supportedProtocols?: string[]
  routingConfig?: RoutingConfig
  metadata?: Record<string, unknown>
}

export function useCreateModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateModelGroupData) => {
      const response = await post<ApiResponse<ModelGroup>>('/api/model-groups', data, { extractData: false })
      if (!response.success) throw new Error(response.error || '创建模型组失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.lists() })
      toast.success('模型组创建成功')
    },
    onError: (error: Error) => { toast.error(error.message) },
  })
}

interface UpdateModelGroupVars {
  id: string
  data: Partial<Omit<CreateModelGroupData, 'name'> & { name: string }>
}

export function useUpdateModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: UpdateModelGroupVars) => {
      const response = await put<ApiResponse<ModelGroup>>(`/api/model-groups/${id}`, data, { extractData: false })
      if (!response.success) throw new Error(response.error || '更新模型组失败')
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.detail(variables.id) })
      toast.success('模型组更新成功')
    },
    onError: (error: Error) => { toast.error(error.message) },
  })
}

export function useDeleteModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteRequest<ApiResponse<ModelGroup>>(`/api/model-groups/${id}`, { extractData: false })
      if (!response.success) throw new Error(response.error || '删除模型组失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.lists() })
      toast.success('模型组删除成功')
    },
    onError: (error: Error) => { toast.error(error.message) },
  })
}

export function useToggleModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await patch<ApiResponse<ModelGroup>>(`/api/model-groups/${id}/toggle`, undefined, { extractData: false })
      if (!response.success) throw new Error(response.error || '切换状态失败')
      return response.data
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.detail(id) })
    },
    onError: (error: Error) => { toast.error(error.message) },
  })
}
