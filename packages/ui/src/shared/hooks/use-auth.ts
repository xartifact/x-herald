/**
 * Auth 相关的 Query Hooks
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'

import { get, post } from '../lib/api-client'

import type { AuthResponse, AuthMeResponse } from '@xartifact/x-herald-shared'

/**
 * 登录
 */
export function useLogin() {
  return useMutation({
    mutationFn: (password: string) =>
      post<AuthResponse>('/api/auth/login', { password }, { requiresAuth: false }),
    onSuccess: (data) => {
      localStorage.setItem('admin_token', data.token)
      toast.success('登录成功')
    },
    onError: (error: unknown) => {
      const apiError = error as { data?: { error?: string } }
      toast.error(apiError.data?.error || '登录失败')
    },
  })
}

/**
 * 验证当前用户
 */
export function useAuthMe(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => get<AuthMeResponse>('/api/auth/me'),
    retry: false,
    staleTime: 5 * 60 * 1000,
    ...options,
  })
}

/**
 * 登出
 */
export function useLogout() {
  return useMutation({
    mutationFn: async () => {
      localStorage.removeItem('admin_token')
    },
    onSuccess: () => {
      toast.success('已退出登录')
    },
  })
}
