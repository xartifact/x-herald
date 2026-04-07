import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post, put, del as deleteRequest, patch } from '@/core/lib/api-client'

import type {
  VirtualModel,
  CreateVirtualModelPayload,
  UpdateVirtualModelPayload,
} from './types'

interface ApiResponse<T> {
  success: boolean
  data: T
  error?: string
}

export const virtualModelKeys = {
  all: ['virtual-models'] as const,
  lists: () => [...virtualModelKeys.all, 'list'] as const,
  detail: (id: string) => [...virtualModelKeys.all, 'detail', id] as const,
}

export function useVirtualModels() {
  return useQuery({
    queryKey: virtualModelKeys.lists(),
    queryFn: async () => {
      const response = await get<ApiResponse<VirtualModel[]>>('/api/virtual-models', {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '获取虚拟模型失败')
      }
      return response.data
    },
  })
}

export function useVirtualModel(id: string | null) {
  return useQuery({
    queryKey: virtualModelKeys.detail(id || ''),
    queryFn: async () => {
      const response = await get<ApiResponse<VirtualModel>>(`/api/virtual-models/${id}`, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '获取虚拟模型详情失败')
      }
      return response.data
    },
    enabled: !!id,
  })
}

export function useCreateVirtualModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateVirtualModelPayload) => {
      const response = await post<ApiResponse<VirtualModel>>('/api/virtual-models', data as unknown as Record<string, unknown>, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '创建虚拟模型失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.lists() })
      toast.success('虚拟模型创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateVirtualModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateVirtualModelPayload }) => {
      const response = await put<ApiResponse<VirtualModel>>(`/api/virtual-models/${id}`, data as unknown as Record<string, unknown>, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '更新虚拟模型失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.lists() })
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.detail(variables.id) })
      toast.success('虚拟模型更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteVirtualModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteRequest<ApiResponse<VirtualModel>>(
        `/api/virtual-models/${id}`,
        { extractData: false }
      )
      if (!response.success) {
        throw new Error(response.error || '删除虚拟模型失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.lists() })
      toast.success('虚拟模型删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useToggleVirtualModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await patch<ApiResponse<VirtualModel>>(
        `/api/virtual-models/${id}/toggle`,
        undefined,
        { extractData: false }
      )
      if (!response.success) {
        throw new Error(response.error || '切换状态失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
