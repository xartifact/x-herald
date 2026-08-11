import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post, del as deleteRequest, patch } from '@xartifact/x-llm-gateway-ui'

import type { CanvasGraph } from '@xartifact/x-llm-gateway-shared'

export interface RouteRuleVersion {
  id: string
  accessModelId: string
  graph: CanvasGraph
  name: string
  description: string | null
  active: boolean
  version: number
  createdAt: string
  updatedAt: string
}

type ApiResponse<T> = { success: boolean; data: T; error?: string }

export const routeRuleKeys = {
  all: (accessModelId: string) => ['route-rules', accessModelId] as const,
  versions: (accessModelId: string) => [...routeRuleKeys.all(accessModelId), 'versions'] as const,
}

export function useRouteRuleVersions(accessModelId: string | null) {
  return useQuery({
    queryKey: routeRuleKeys.versions(accessModelId || ''),
    queryFn: async () => {
      const response = await get<ApiResponse<RouteRuleVersion[]>>(
        `/api/access-models/${accessModelId}/route-rules`,
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '获取路由规则版本失败')
      return response.data
    },
    enabled: !!accessModelId,
  })
}

export function useSaveRouteRuleDraft(accessModelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (input: { graph: CanvasGraph; name?: string; description?: string }) => {
      const response = await post<ApiResponse<RouteRuleVersion>>(
        `/api/access-models/${accessModelId}/route-rules`,
        input as unknown as Record<string, unknown>,
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '保存草稿失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: routeRuleKeys.versions(accessModelId) })
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useActivateRouteRuleVersion(accessModelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (versionId: string) => {
      const response = await patch<ApiResponse<RouteRuleVersion>>(
        `/api/access-models/${accessModelId}/route-rules/${versionId}/activate`,
        undefined,
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '激活版本失败')
      return response.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: routeRuleKeys.versions(accessModelId) })
      toast.success('版本已激活')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}

export function useDeleteRouteRuleVersion(accessModelId: string) {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (versionId: string) => {
      const response = await deleteRequest<ApiResponse<null>>(
        `/api/access-models/${accessModelId}/route-rules/${versionId}`,
        { extractData: false },
      )
      if (!response.success) throw new Error(response.error || '删除版本失败')
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: routeRuleKeys.versions(accessModelId) })
      toast.success('版本已删除')
    },
    onError: (error: Error) => toast.error(error.message),
  })
}
