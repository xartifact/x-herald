/**
 * Auth 相关的 Query Hooks
 */

import { useMutation, useQuery } from '@tanstack/react-query'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

import { get, post } from '@/core/lib/api-client'

import type { AuthResponse, AuthMeResponse } from './types'

/**
 * 登录
 */
export function useLogin() {
  const router = useRouter()

  return useMutation({
    mutationFn: (password: string) =>
      post<AuthResponse>('/api/auth/login', { password }, { requiresAuth: false }),
    onSuccess: (data) => {
      localStorage.setItem('admin_token', data.token)
      toast.success('登录成功,正在跳转...')
      setTimeout(() => {
        router.push('/admin/dashboard')
      }, 100)
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
    staleTime: 5 * 60 * 1000, // 5 分钟内不重新验证
    ...options,
  })
}

/**
 * 登出
 */
export function useLogout() {
  const router = useRouter()

  return useMutation({
    mutationFn: async () => {
      localStorage.removeItem('admin_token')
    },
    onSuccess: () => {
      toast.success('已退出登录')
      router.push('/admin/login')
    },
  })
}
