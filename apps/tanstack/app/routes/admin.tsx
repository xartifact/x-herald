import { Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AdminNav } from '@x-llm-gateway/ui'

export function AdminLayout() {
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (!token) navigate({ to: '/login' })
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="container mx-auto py-6 px-4">
        <Outlet />
      </main>
    </div>
  )
}
