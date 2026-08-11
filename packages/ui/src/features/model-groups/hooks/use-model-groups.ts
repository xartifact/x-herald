import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post, put, del as deleteRequest, patch } from '@xartifact/x-llm-gateway-ui'

import type {
  ApiResponse,
  InstanceCost,
  InstanceTestResult,
  ModelGroup,
  ModelGroupDetail,
  ModelInstance,
  RoutingConfig,
} from '@xartifact/x-llm-gateway-shared'

// ── Query key factory ──────────────────────────────────────────────

export const modelGroupKeys = {
  all: ['model-groups'] as const,
  lists: () => [...modelGroupKeys.all, 'list'] as const,
  list: (filters: string) => [...modelGroupKeys.lists(), { filters }] as const,
  details: () => [...modelGroupKeys.all, 'detail'] as const,
  detail: (id: string) => [...modelGroupKeys.details(), id] as const,
  instances: () => [...modelGroupKeys.all, 'instances'] as const,
}

// ── Model Group CRUD ───────────────────────────────────────────────

export function useModelGroups() {
  return useQuery({
    queryKey: modelGroupKeys.lists(),
    queryFn: async () => {
      const response = await get<ApiResponse<ModelGroup[]>>('/api/model-groups', {
        extractData: false,
      })
      if (!response.success) throw new Error(response.error || '获取模型组失败')
      return response.data
    },
  })
}

export function useModelGroup(id: string) {
  return useQuery({
    queryKey: modelGroupKeys.detail(id),
    queryFn: async () => {
      const response = await get<ApiResponse<ModelGroupDetail>>(`/api/model-groups/${id}`, {
        extractData: false,
      })
      if (!response.success) throw new Error(response.error || '获取模型组详情失败')
      return response.data
    },
    enabled: !!id,
  })
}

export interface CreateModelGroupData {
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
      const response = await post<ApiResponse<ModelGroup>>('/api/model-groups', data, {
        extractData: false,
      })
      if (!response.success) throw new Error(response.error || '创建模型组失败')
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

export interface UpdateModelGroupVars {
  id: string
  data: Partial<Omit<CreateModelGroupData, 'name'> & { name: string }>
}

export function useUpdateModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: UpdateModelGroupVars) => {
      const response = await put<ApiResponse<ModelGroup>>(`/api/model-groups/${id}`, data, {
        extractData: false,
      })
      if (!response.success) throw new Error(response.error || '更新模型组失败')
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

export function useDeleteModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteRequest<ApiResponse<ModelGroup>>(`/api/model-groups/${id}`, {
        extractData: false,
      })
      if (!response.success) throw new Error(response.error || '删除模型组失败')
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

export function useToggleModelGroup() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await patch<ApiResponse<ModelGroup>>(
        `/api/model-groups/${id}/toggle`,
        undefined,
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '切换状态失败')
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

// ── Model Instance CRUD ────────────────────────────────────────────

export function useModelInstances() {
  return useQuery({
    queryKey: modelGroupKeys.instances(),
    queryFn: async () => {
      const response = await get<ApiResponse<ModelInstance[]>>('/api/model-groups/instances', {
        extractData: false,
      })
      if (!response.success) throw new Error(response.error || '获取模型实例列表失败')
      return response.data
    },
  })
}

export function useReorderInstances() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (instanceIds: string[]) => {
      const response = await put<ApiResponse<null>>(
        '/api/model-groups/instances/reorder',
        { instanceIds },
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '更新优先级失败')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export interface CreateInstanceData {
  groupIds?: string[]
  groupId?: string | null
  providerId: string
  name: string
  actualModelName: string
  description?: string
  weight?: number
  priority?: number
  costPer1kTokens?: InstanceCost
  config?: ModelInstance['config']
}

export function useCreateModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateInstanceData) => {
      const response = await post<ApiResponse<ModelInstance>>('/api/model-groups/instances', data, {
        extractData: false,
      })
      if (!response.success) throw new Error(response.error || '创建模型实例失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
      toast.success('模型实例创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export interface UpdateInstanceVars {
  id: string
  data: Partial<Omit<CreateInstanceData, 'groupId'> & { groupIds: string[] }>
}

export function useUpdateModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: UpdateInstanceVars) => {
      const response = await put<ApiResponse<ModelInstance>>(
        `/api/model-groups/instances/${id}`,
        data,
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '更新模型实例失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
      toast.success('模型实例更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const response = await deleteRequest<ApiResponse<ModelInstance>>(
        `/api/model-groups/instances/${id}`,
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '删除模型实例失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
      toast.success('模型实例删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useSetInstanceGroups() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, groupIds }: { id: string; groupIds: string[] }) => {
      const response = await put<ApiResponse<ModelInstance>>(
        `/api/model-groups/instances/${id}/groups`,
        { groupIds },
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '设置模型组失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
      toast.success('模型组设置成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useToggleModelInstance() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const response = await patch<ApiResponse<ModelInstance>>(
        `/api/model-groups/instances/${id}/toggle`,
        undefined,
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '切换状态失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelGroupKeys.instances() })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

/**
 * 测试模型实例连通性与可用性（POST /instances/:id/test）。
 * 返回的 result.ok 区分成功/失败，由调用方（如 InstanceTestButton）决定如何提示。
 */
export function useTestInstance() {
  return useMutation({
    mutationFn: async (instanceId: string) => {
      return post<InstanceTestResult>(`/api/model-groups/instances/${instanceId}/test`)
    },
  })
}
