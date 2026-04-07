'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

import type { SettingsData, SettingsFormData } from './types';

// API 基础 URL
const API_BASE = '/api';

// 获取系统配置
async function fetchSettings(): Promise<SettingsData> {
  const response = await fetch(`${API_BASE}/settings`, {
    headers: {
      Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
    },
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to fetch settings');
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to fetch settings');
  }

  return result.data;
}

// 更新系统配置
async function updateSettings(data: SettingsFormData): Promise<void> {
  const response = await fetch(`${API_BASE}/settings`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
    },
    body: JSON.stringify(data),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || 'Failed to update settings');
  }

  const result = await response.json();
  if (!result.success) {
    throw new Error(result.error || 'Failed to update settings');
  }
}

// 获取系统配置 Hook
export function useSettings() {
  return useQuery<SettingsData, Error>({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });
}

// 更新系统配置 Hook
export function useUpdateSettings() {
  const queryClient = useQueryClient();

  return useMutation<void, Error, SettingsFormData>({
    mutationFn: updateSettings,
    onSuccess: () => {
      toast.success('设置已更新', {
        description: '配置已生效，无需重启服务',
      });
      // 刷新配置数据
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => {
      toast.error('更新失败', {
        description: error.message,
      });
    },
  });
}
