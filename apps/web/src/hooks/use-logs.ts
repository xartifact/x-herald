/**
 * Logs 相关的 Query Hooks
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { get, del, post } from '@/core/lib/api-client'
import { toast } from 'sonner'

// Log 元数据类型
export interface LogMetadata {
  content?: {
    types?: string[];
    hasFunctionCalling?: boolean;
    toolNames?: string[];
  };
  toolCalls?: {
    pattern?: string;
    tools?: string[];
  };
  [key: string]: unknown;
}

// Query Keys
export const logKeys = {
  all: ['logs'] as const,
  lists: () => [...logKeys.all, 'list'] as const,
  list: (filters: string) => [...logKeys.lists(), { filters }] as const,
  details: () => [...logKeys.all, 'detail'] as const,
  detail: (id: string) => [...logKeys.details(), id] as const,
  stats: () => [...logKeys.all, 'stats'] as const,
  storage: () => [...logKeys.all, 'storage'] as const,
}

// 列表项（轻量级）- 只包含列表展示需要的字段
export interface LogListItem {
  id: string
  virtualKeyId: string | null
  virtualKeyName: string | null
  modelName: string
  originalModelName: string | null
  providerId: string | null
  providerName: string | null
  status: 'success' | 'failure'
  statusCode: number | null
  latencyMs: number
  inputTokens: number
  outputTokens: number
  totalTokens: number
  streaming: string
  errorMessage: string | null
  errorType: string | null
  clientType: string | null
  createdAt: string
}

// 详情项（完整）- 包含所有字段
export interface Log extends LogListItem {
  requestHeaders: Record<string, string> | null
  // 请求头链路追踪
  providerRequestHeaders: Record<string, string> | null
  // 请求链路追踪
  requestBody: Record<string, unknown> | null
  standardRequestBody: Record<string, unknown> | null
  transformedRequestBody: Record<string, unknown> | null
  // 响应头链路追踪
  providerResponseHeaders: Record<string, string> | null
  clientResponseHeaders: Record<string, string> | null
  // 响应链路追踪
  providerResponseBody: Record<string, unknown> | null
  standardResponseBody: Record<string, unknown> | null
  responseBody: Record<string, unknown> | null
  clientIp: string | null
  userAgent: string | null
  requestPath: string | null
  requestMethod: string | null
  incomingProtocol: string | null
  targetProtocol: string | null
  // 标记系统
  metadata: LogMetadata | null
  toolCallsCount: number | null
  conversationId?: string
}

export interface LogStats {
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
  clientStats: Array<{
    clientType: string | null
    requestCount: number
  }>
}

export interface LogStorage {
  totalCount: number
  oldestLogDate: string | null
  newestLogDate: string | null
  retentionDays: number
  cutoffDate: string
  estimatedExpiredLogs: string
}

export interface LogsListResponse {
  success: boolean
  data: LogListItem[]
  pagination: {
    page: number
    pageSize: number
    total: number
    totalPages: number
  }
}

export interface LogResponse {
  success: boolean
  data: Log
}

export interface LogStatsResponse {
  success: boolean
  data: LogStats
}

export interface LogStorageResponse {
  success: boolean
  data: LogStorage
}

export interface CleanupResponse {
  success: boolean
  data: {
    deletedCount: number
    retentionDays: number
  }
  message: string
}

/**
 * 获取日志列表
 */
export function useLogs(filters?: Record<string, string>) {
  const queryString = filters ? '?' + new URLSearchParams(filters).toString() : ''
  return useQuery({
    queryKey: logKeys.list(queryString),
    queryFn: () => get<LogsListResponse>(`/api/logs${queryString}`, { extractData: false }),
  })
}

/**
 * 获取单个日志
 */
export function useLog(id: string) {
  return useQuery({
    queryKey: logKeys.detail(id),
    queryFn: () => get<LogResponse>(`/api/logs/${id}`, { extractData: false }),
    enabled: !!id,
  })
}

/**
 * 获取日志统计
 */
export function useLogStats(filters?: Record<string, string>) {
  const queryString = filters ? '?' + new URLSearchParams(filters).toString() : ''
  return useQuery({
    queryKey: [...logKeys.stats(), queryString],
    queryFn: () => get<LogStatsResponse>(`/api/logs/stats/overview${queryString}`, { extractData: false }),
  })
}

/**
 * 获取日志存储统计
 */
export function useLogStorage() {
  return useQuery({
    queryKey: logKeys.storage(),
    queryFn: () => get<LogStorageResponse>('/api/logs/stats/storage', { extractData: false }),
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
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '删除失败')
    },
  })
}

/**
 * 清理过期日志
 */
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
