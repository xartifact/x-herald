/**
 * Virtual Key 相关的 Query Hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, post, put, del } from '@/core/lib/api-client'
import type { VirtualKey } from './types'
import { toast } from 'sonner'

// Query Keys
export const keyKeys = {
  all: ['keys'] as const,
  lists: () => [...keyKeys.all, 'list'] as const,
  list: (filters: string) => [...keyKeys.lists(), { filters }] as const,
  details: () => [...keyKeys.all, 'detail'] as const,
  detail: (id: string) => [...keyKeys.details(), id] as const,
}

/**
 * 获取密钥列表
 */
export function useKeys() {
  return useQuery({
    queryKey: keyKeys.lists(),
    queryFn: () => get<VirtualKey[]>('/api/keys'),
  })
}

/**
 * 获取单个密钥
 */
export function useKey(id: string) {
  return useQuery({
    queryKey: keyKeys.detail(id),
    queryFn: () => get<VirtualKey>(`/api/keys/${id}`),
    enabled: !!id,
  })
}

/**
 * 创建密钥
 */
export function useCreateKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (data: {
      name: string
      allowedModels?: string[] | null
      rateLimitRpm?: number | null
      rateLimitRpd?: number | null
      tokenLimitDaily?: number | null
      enabled?: boolean
      expiresAt?: string | null
    }) => post<VirtualKey>('/api/keys', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keyKeys.lists() })
      toast.success('密钥创建成功')
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '创建失败')
    },
  })
}

/**
 * 更新密钥
 */
export function useUpdateKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: ({ id, data }: {
      id: string;
      data: {
        name?: string;
        allowedModels?: string[] | null;
        rateLimitRpm?: number | null;
        rateLimitRpd?: number | null;
        tokenLimitDaily?: number | null;
        enabled?: boolean;
        expiresAt?: string | null;
      }
    }) => put<VirtualKey>(`/api/keys/${id}`, data),
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: keyKeys.lists() })
      queryClient.invalidateQueries({ queryKey: keyKeys.detail(variables.id) })
      toast.success('密钥更新成功')
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '更新失败')
    },
  })
}

/**
 * 删除密钥
 */
export function useDeleteKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => del<void>(`/api/keys/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: keyKeys.lists() })
      toast.success('密钥删除成功')
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '删除失败')
    },
  })
}

/**
 * 重置密钥
 */
export function useResetKey() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => post<VirtualKey>(`/api/keys/${id}/reset`, {}),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: keyKeys.lists() })
      queryClient.invalidateQueries({ queryKey: keyKeys.detail(data.id) })
      toast.success('密钥已重置，请保存新的密钥值')
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '重置失败')
    },
  })
}
