import { useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post, put, del as deleteRequest } from '@xartifact/x-herald-ui'

import type {
  AccessModel,
  ConvertToAccessModelInput,
  ListPotentialModelsQuery,
  Pagination,
  PotentialModel,
  UpdatePotentialModelInput,
} from '@xartifact/x-herald-shared'

interface PotentialModelsListResult {
  data: PotentialModel[]
  pagination: Pagination
}

type ApiResponse<T> = { success: boolean; data: T; error?: string }

export const potentialModelKeys = {
  all: ['potential-models'] as const,
  lists: () => [...potentialModelKeys.all, 'list'] as const,
  list: (query: string) => [...potentialModelKeys.lists(), query] as const,
  byAction: (action: string) => [...potentialModelKeys.all, 'byAction', action] as const,
  detail: (id: string) => [...potentialModelKeys.all, 'detail', id] as const,
}

function buildQueryString(filters: Partial<ListPotentialModelsQuery>): string {
  const params = new URLSearchParams()
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null) continue
    params.set(k, String(v))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

export function usePotentialModels(params: Partial<ListPotentialModelsQuery> = {}) {
  const queryString = buildQueryString(params)
  return useQuery({
    queryKey: potentialModelKeys.list(queryString),
    queryFn: async (): Promise<PotentialModelsListResult> => {
      const response = await get<{
        success: boolean
        data: PotentialModel[]
        pagination: Pagination
        error?: string
      }>(`/api/potential-models${queryString}`, { extractData: false })
      if (!response.success) {
        throw new Error(response.error || '获取潜在模型失败')
      }
      return { data: response.data, pagination: response.pagination }
    },
  })
}

export function usePotentialModel(id: string | null) {
  return useQuery({
    queryKey: potentialModelKeys.detail(id || ''),
    queryFn: async () => {
      const response = await get<ApiResponse<PotentialModel>>(`/api/potential-models/${id}`, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '获取潜在模型详情失败')
      }
      return response.data
    },
    enabled: !!id,
  })
}

export function useUpdatePotentialModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: UpdatePotentialModelInput }) => {
      const response = await put<ApiResponse<PotentialModel>>(
        `/api/potential-models/${id}`,
        data as unknown as Record<string, unknown>,
        { extractData: false },
      )
      if (!response.success) {
        throw new Error(response.error || '更新潜在模型失败')
      }
      return response.data
    },
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: potentialModelKeys.lists() })
      queryClient.invalidateQueries({ queryKey: potentialModelKeys.detail(variables.id) })
      if (data?.action) {
        queryClient.invalidateQueries({ queryKey: potentialModelKeys.byAction(data.action) })
      }
      toast.success('潜在模型更新成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export function useDeletePotentialModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const response = await deleteRequest<ApiResponse<unknown>>(`/api/potential-models/${id}`, {
        extractData: false,
      })
      if (!response.success) {
        throw new Error(response.error || '删除潜在模型失败')
      }
      return response
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: potentialModelKeys.lists() })
      toast.success('潜在模型删除成功')
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

export interface ConvertResult {
  accessModelId: string
  potentialDeleted: boolean
}

export function useConvertPotentialModel() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: ConvertToAccessModelInput }) => {
      const response = await post<ApiResponse<ConvertResult>>(
        `/api/potential-models/${id}/convert`,
        data as unknown as Record<string, unknown>,
        { extractData: false },
      )
      if (!response.success) {
        throw new Error(response.error || '转换潜在模型失败')
      }
      return response.data
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: potentialModelKeys.lists() })
      queryClient.invalidateQueries({ queryKey: accessModelKeys.lists() })
      if (result?.accessModelId) {
        toast.success(`已创建接入模型 (${result.accessModelId.slice(0, 8)}...)`)
      } else {
        toast.success('已转换为接入模型')
      }
    },
    onError: (error: Error) => {
      toast.error(error.message)
    },
  })
}

// Access-model hooks (re-used from access-models keyspace) for the route-to dropdown.
// Imported here to keep a single import surface for potential-models consumers.
import { accessModelKeys } from '../access-models/use-access-models'

export function useAccessModelsForTarget() {
  const query = useQuery({
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
  const enabledModels = useMemo(() => (query.data ?? []).filter((am) => am.enabled), [query.data])
  return { ...query, enabledModels }
}
