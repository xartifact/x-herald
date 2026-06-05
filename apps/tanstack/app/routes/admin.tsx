import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { AdminNav, useAuthMe } from '@x-llm-gateway/ui'

export function AdminLayout() {
  const navigate = useNavigate()
  const [token] = useState(() => localStorage.getItem('admin_token'))
  const { isLoading, isError } = useAuthMe({ enabled: !!token })

  useEffect(() => {
    if (!token) {
      navigate({ to: '/login' })
      return
    }
    if (isError) {
      localStorage.removeItem('admin_token')
      navigate({ to: '/login' })
    }
  }, [token, isError, navigate])

  if (!token || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">正在验证身份...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="container mx-auto py-6 px-4">
        <Outlet />
      </main>
    </div>
  )
}
