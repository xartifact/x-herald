'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { SettingsData, SettingsFormData } from '@xartifact/x-llm-gateway-shared'
import { get, put } from '@xartifact/x-llm-gateway-ui'

async function fetchSettings(): Promise<SettingsData> {
  const result = await get<{ success: boolean; data: SettingsData }>('/api/settings', { extractData: false })
  if (!result.success) throw new Error('Failed to fetch settings')
  return result.data
}

async function updateSettingsFn(data: SettingsFormData): Promise<void> {
  const result = await put<{ success: boolean }>('/api/settings', data, { extractData: false })
  if (!result.success) throw new Error('Failed to update settings')
}

export function useSettings() {
  return useQuery<SettingsData, Error>({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  })
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()

  return useMutation<void, Error, SettingsFormData>({
    mutationFn: updateSettingsFn,
    onSuccess: () => {
      toast.success('设置已更新', {
        description: '配置已生效，无需重启服务',
      })
      queryClient.invalidateQueries({ queryKey: ['settings'] })
    },
    onError: (error) => {
      toast.error('更新失败', {
        description: error.message,
      })
    },
  })
}
