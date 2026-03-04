import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del as deleteRequest, patch } from '@/core/lib/api-client'
import { toast } from 'sonner'
import type {
  VirtualModel,
  CreateVirtualModelPayload,
  UpdateVirtualModelPayload,
  CreateMappingPayload,
  UpdateMappingPayload,
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

// ==================== 映射 Mutations ====================

export function useAddMapping() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ virtualModelId, data }: { virtualModelId: string; data: CreateMappingPayload }) => {
      const response = await post<ApiResponse<unknown>>(
        `/api/virtual-models/${virtualModelId}/mappings`,
        data as unknown as Record<string, unknown>,
        { extractData: false }
      )
      if (!response.success) {
        throw new Error(response.error || '添加映射失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.detail(variables.virtualModelId) })
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.lists() })
      toast.success('映射添加成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateMapping() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ virtualModelId, mappingId, data }: { virtualModelId: string; mappingId: string; data: UpdateMappingPayload }) => {
      const response = await put<ApiResponse<unknown>>(
        `/api/virtual-models/${virtualModelId}/mappings/${mappingId}`,
        data as unknown as Record<string, unknown>,
        { extractData: false }
      )
      if (!response.success) {
        throw new Error(response.error || '更新映射失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.detail(variables.virtualModelId) })
      toast.success('映射更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteMapping() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ virtualModelId, mappingId }: { virtualModelId: string; mappingId: string }) => {
      const response = await deleteRequest<ApiResponse<unknown>>(
        `/api/virtual-models/${virtualModelId}/mappings/${mappingId}`,
        { extractData: false }
      )
      if (!response.success) {
        throw new Error(response.error || '删除映射失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.detail(variables.virtualModelId) })
      queryClient.invalidateQueries({ queryKey: virtualModelKeys.lists() })
      toast.success('映射删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
