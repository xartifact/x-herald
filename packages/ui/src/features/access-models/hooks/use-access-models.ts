import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post, put, del as deleteRequest, patch } from '@xartifact/x-herald-ui'

import type {
  AccessModel,
  CreateAccessModelPayload,
  UpdateAccessModelPayload,
} from '@xartifact/x-herald-shared'

type ApiResponse<T> = { success: boolean; data: T; error?: string }

export const accessModelKeys = {
  all: ['access-models'] as const,
  lists: () => [...accessModelKeys.all, 'list'] as const,
  detail: (id: string) => [...accessModelKeys.all, 'detail', id] as const,
}

export function useAccessModels() {
  return useQuery({
    queryKey: accessModelKeys.lists(),
    queryFn: async () => {
      const response = await get<ApiResponse<AccessModel[]>>('/api/access-models', {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '获取接入模型失败')
      }
      return response.data
    },
  })
}

export function useAccessModel(id: string | null) {
  return useQuery({
    queryKey: accessModelKeys.detail(id || ''),
    queryFn: async () => {
      const response = await get<ApiResponse<AccessModel>>(`/api/access-models/${id}`, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '获取接入模型详情失败')
      }
      return response.data
    },
    enabled: !!id,
  })
}

export function useCreateAccessModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (data: CreateAccessModelPayload) => {
      const response = await post<ApiResponse<AccessModel>>(
        '/api/access-models',
        data as unknown as Record<string, unknown>,
        { extractData: false },
      )
      if (!response.success) {
        throw new Error(response.error || '创建接入模型失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessModelKeys.lists() })
      toast.success('接入模型创建成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useUpdateAccessModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdateAccessModelPayload }) => {
      const response = await put<ApiResponse<AccessModel>>(
        `/api/access-models/${id}`,
        data as unknown as Record<string, unknown>,
        { extractData: false },
      )
      if (!response.success) {
        throw new Error(response.error || '更新接入模型失败')
      }
      return response.data
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: accessModelKeys.lists() })
      queryClient.invalidateQueries({ queryKey: accessModelKeys.detail(variables.id) })
      toast.success('接入模型更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeleteAccessModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteRequest<ApiResponse<AccessModel>>(`/api/access-models/${id}`, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '删除接入模型失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessModelKeys.lists() })
      toast.success('接入模型删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useToggleAccessModel() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (id: string) => {
      const response = await patch<ApiResponse<AccessModel>>(
        `/api/access-models/${id}/toggle`,
        undefined,
        { extractData: false },
      )
      if (!response.success) {
        throw new Error(response.error || '切换状态失败')
      }
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessModelKeys.lists() })
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}
