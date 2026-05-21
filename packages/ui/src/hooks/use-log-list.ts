import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, del, post } from '../lib/api-client'

import { logKeys } from './log-types'
import type { CleanupResponse, LogsListResponse } from './log-types'

export function useLogs(filters?: Record<string, string>) {
  const queryString = filters ? '?' + new URLSearchParams(filters).toString() : ''
  return useQuery({
    queryKey: logKeys.list(queryString),
    queryFn: () => get<LogsListResponse>(`/api/logs${queryString}`, { extractData: false }),
  })
}

export function useDeleteLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => del<void>(`/api/logs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: logKeys.lists() })
      toast.success('日志删除成功')
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '删除失败')
    },
  })
}

export function useCleanupLogs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (retentionDays: number) =>
      post<CleanupResponse>('/api/logs/cleanup', { retentionDays }, { extractData: false }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: logKeys.lists() })
      queryClient.invalidateQueries({ queryKey: logKeys.storage() })
      toast.success(`已清理 ${data.data.deletedCount} 条过期日志`)
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '清理失败')
    },
  })
}
