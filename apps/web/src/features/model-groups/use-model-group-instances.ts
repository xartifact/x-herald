import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post, put, del as deleteRequest, patch } from '@/core/lib/api-client'

import type { ModelInstance, ApiResponse } from './types'
import { modelGroupKeys } from './use-model-group-crud'

export function useModelInstances() {
  return useQuery({
    queryKey: modelGroupKeys.instances(),
    queryFn: async () => {
      const response = await get<ApiResponse<ModelInstance[]>>('/api/model-groups/instances', { extractData: false })
      if (!response.success) throw new Error(response.error || '获取模型实例列表失败')
      return response.data
    },
  })
}

export function useReorderInstances() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (instanceIds: string[]) => {
      const response = await put<ApiResponse<null>>('/api/model-groups/instances/reorder', { instanceIds }, { extractData: false })
      if (!response.success) throw new Error(response.error || '更新优先级失败')
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() }) },
    onError: (error: Error) => { toast.error(error.message) },
  })
}

interface CreateInstanceData {
  groupIds?: string[]
  groupId?: string | null
  providerId: string
  name: string
  actualModelName: string
  description?: string
  weight?: number
  priority?: number
  costPer1kTokens?: { input: number; output: number }
  config?: ModelInstance['config']
}

export function useCreateModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateInstanceData) => {
      const response = await post<ApiResponse<ModelInstance>>('/api/model-groups/instances', data, { extractData: false })
      if (!response.success) throw new Error(response.error || '创建模型实例失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
      toast.success('模型实例创建成功')
    },
    onError: (error: Error) => { toast.error(error.message) },
  })
}

interface UpdateInstanceVars {
  id: string
  data: Partial<Omit<CreateInstanceData, 'groupId'> & { groupIds: string[] }>
}

export function useUpdateModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: UpdateInstanceVars) => {
      const response = await put<ApiResponse<ModelInstance>>(`/api/model-groups/instances/${id}`, data, { extractData: false })
      if (!response.success) throw new Error(response.error || '更新模型实例失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
      toast.success('模型实例更新成功')
    },
    onError: (error: Error) => { toast.error(error.message) },
  })
}

export function useDeleteModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const response = await deleteRequest<ApiResponse<ModelInstance>>(`/api/model-groups/instances/${id}`, { extractData: false })
      if (!response.success) throw new Error(response.error || '删除模型实例失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
      toast.success('模型实例删除成功')
    },
    onError: (error: Error) => { toast.error(error.message) },
  })
}

export function useSetInstanceGroups() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, groupIds }: { id: string; groupIds: string[] }) => {
      const response = await put<ApiResponse<ModelInstance>>(
        `/api/model-groups/instances/${id}/groups`,
        { groupIds },
        { extractData: false }
      )
      if (!response.success) throw new Error(response.error || '设置模型组失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
      toast.success('模型组设置成功')
    },
    onError: (error: Error) => { toast.error(error.message) },
  })
}

/** @deprecated use useSetInstanceGroups */
export const useAssignInstance = useSetInstanceGroups

export function useToggleModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const response = await patch<ApiResponse<ModelInstance>>(`/api/model-groups/instances/${id}/toggle`, undefined, { extractData: false })
      if (!response.success) throw new Error(response.error || '切换状态失败')
      return response.data
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() }) },
    onError: (error: Error) => { toast.error(error.message) },
  })
}
