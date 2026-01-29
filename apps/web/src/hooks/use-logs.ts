/**
 * Request Logs 相关的 Query Hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, post, del } from '@/lib/api-client'
import { toast } from 'sonner'

// Query Keys
export const logKeys = {
  all: ['logs'] as const,
  lists: () => [...logKeys.all, 'list'] as const,
  list: (filters: Record<string, string>) => [...logKeys.lists(), { filters }] as const,
  details: () => [...logKeys.all, 'detail'] as const,
  detail: (id: string) => [...logKeys.details(), id] as const,
  stats: () => [...logKeys.all, 'stats'] as const,
  overview: (filters: Record<string, string>) => [...logKeys.stats(), { filters }] as const,
}

// 日志条目类型
export interface RequestLog {
  id: string
  virtualKeyId: string | null
  virtualKeyName: string | null
  modelName: string
  providerId: string | null
  providerName: string | null
  status: 'success' | 'failure'
  statusCode: number | null
  latencyMs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  requestHeaders: Record<string, string> | null
  requestBody: unknown
  responseHeaders: Record<string, string> | null
  responseBody: unknown
  errorMessage: string | null
  errorType: string | null
  clientIp: string | null
  userAgent: string | null
  requestPath: string | null
  requestMethod: string | null
  streaming: string
  createdAt: string
}

// 日志列表响应
export interface LogsListResponse {
  success: boolean
  data: RequestLog[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

// 日志详情响应
export interface LogDetailResponse {
  success: boolean
  data: RequestLog
}

// 统计概览响应
export interface LogStatsResponse {
  success: boolean
  data: {
    overview: {
      totalRequests: number
      successRequests: number
      failureRequests: number
      avgLatency: number
      totalInputTokens: number
      totalOutputTokens: number
      totalTokens: number
    }
    modelStats: Array<{
      modelName: string
      requestCount: number
      avgLatency: number
      totalTokens: number
    }>
    keyStats: Array<{
      virtualKeyId: string
      virtualKeyName: string
      requestCount: number
      totalTokens: number
    }>
  }
}

/**
 * 获取日志列表
 */
export function useLogs(filters: Record<string, string> = {}) {
  return useQuery({
    queryKey: logKeys.list(filters),
    queryFn: () => get<LogsListResponse>('/api/logs', { params: filters, extractData: false }),
  })
}

/**
 * 获取日志详情
 */
export function useLog(id: string) {
  return useQuery({
    queryKey: logKeys.detail(id),
    queryFn: () => get<LogDetailResponse>(`/api/logs/${id}`, { extractData: false }),
    enabled: !!id,
  })
}

/**
 * 获取日志统计概览
 */
export function useLogStats(filters: Record<string, string> = {}) {
  return useQuery({
    queryKey: logKeys.overview(filters),
    queryFn: () => get<LogStatsResponse>('/api/logs/stats/overview', { params: filters, extractData: false }),
  })
}

/**
 * 删除日志
 */
export function useDeleteLog() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (id: string) => del<void>(`/api/logs/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: logKeys.lists() })
      toast.success('日志删除成功')
    },
    onError: (error: any) => {
      toast.error(error.data?.error || '删除失败')
    },
  })
}

// 存储统计响应
export interface LogStorageResponse {
  success: boolean
  data: {
    totalCount: number
    oldestLogDate: string | null
    newestLogDate: string | null
    retentionDays: number
    cutoffDate: string
    estimatedExpiredLogs: string
  }
}

/**
 * 获取日志存储统计
 */
export function useLogStorage() {
  return useQuery({
    queryKey: [...logKeys.all, 'storage'],
    queryFn: () => get<LogStorageResponse>('/api/logs/stats/storage', { extractData: false }),
  })
}

// 清理响应
export interface LogCleanupResponse {
  success: boolean
  data: {
    deletedCount: number
    retentionDays: number
  }
  message: string
}

/**
 * 手动触发日志清理
 */
export function useCleanupLogs() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: (retentionDays: number) =>
      post<LogCleanupResponse>('/api/logs/cleanup', { retentionDays }, { extractData: false }),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: logKeys.lists() })
      queryClient.invalidateQueries({ queryKey: [...logKeys.all, 'storage'] })
      queryClient.invalidateQueries({ queryKey: logKeys.stats() })
      toast.success(`已清理 ${data.data.deletedCount} 条过期日志`)
    },
    onError: (error: any) => {
      toast.error(error.data?.error || '清理失败')
    },
  })
}
