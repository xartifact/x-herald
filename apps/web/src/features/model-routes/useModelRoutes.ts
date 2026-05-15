import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post, put, del as deleteRequest, patch } from '@/core/lib/api-client'

import type { ModelRoute, CreateModelRoutePayload, UpdateModelRoutePayload } from './types'

interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

export const modelRouteKeys = {
  all: ['model-routes'] as const,
  lists: () => [...modelRouteKeys.all, 'list'] as const,
  detail: (id: string) => [...modelRouteKeys.all, 'detail', id] as const,
  flow: () => [...modelRouteKeys.all, 'flow'] as const,
}

export function useModelRoutes(virtualModelId?: string) {
  return useQuery({
    queryKey: [...modelRouteKeys.lists(), virtualModelId],
    queryFn: async () => {
      const params = virtualModelId ? `?virtualModelId=${virtualModelId}` : ''
      const response = await get<ApiResponse<ModelRoute[]>>(`/api/model-routes${params}`, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '获取路由规则失败')
      }
      return response.data
    },
  })
}

export function useModelRoute(id: string | null) {
  return useQuery({
    queryKey: modelRouteKeys.detail(id || ''),
    queryFn: async () => {
      const response = await get<ApiResponse<ModelRoute>>(`/api/model-routes/${id}`, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '获取路由规则详情失败')
      }
      return response.data
    },
    enabled: !!id,
  })
}

interface FlowDataResponse {
  routes: ModelRoute[]
  accessModels: Array<{ id: string; name: string; displayName: string | null }>
  /** @deprecated use accessModels */
  virtualModels: Array<{ id: string; name: string; displayName: string | null }>
}

export function useFlowData() {
  return useQuery({
    queryKey: modelRouteKeys.flow(),
    queryFn: async () => {
      const response = await get<ApiResponse<FlowDataResponse>>('/api/model-routes/flow', {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '获取 Flow 数据失败')
      }
      return response.data
    },
  })
}

export function useCreateModelRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateModelRoutePayload) => {
      const response = await post<ApiResponse<ModelRoute>>('/api/model-routes', data as unknown as Record<string, unknown>, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '创建路由规则失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelRouteKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelRouteKeys.flow() })
      toast.success('路由规则创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateModelRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateModelRoutePayload }) => {
      const response = await put<ApiResponse<ModelRoute>>(`/api/model-routes/${id}`, data as unknown as Record<string, unknown>, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '更新路由规则失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: modelRouteKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelRouteKeys.detail(variables.id) })
      queryClient.invalidateQueries({ queryKey: modelRouteKeys.flow() })
      toast.success('路由规则更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteModelRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteRequest<ApiResponse<ModelRoute>>(`/api/model-routes/${id}`, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '删除路由规则失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelRouteKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelRouteKeys.flow() })
      toast.success('路由规则删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useToggleModelRoute() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await patch<ApiResponse<ModelRoute>>(`/api/model-routes/${id}/toggle`, undefined, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '切换状态失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelRouteKeys.lists() })
      queryClient.invalidateQueries({ queryKey: modelRouteKeys.flow() })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
