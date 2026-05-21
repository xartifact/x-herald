import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useEffect } from 'react'
import { AdminNav } from '@x-llm-gateway/ui'

export const Route = createFileRoute('/admin')({
  component: AdminLayout,
})

function AdminLayout() {
  const navigate = useNavigate()

  useEffect(() => {
    const token = localStorage.getItem('admin_token')
    if (!token) navigate({ to: '/login' })
  }, [])

  return (
    <div className="min-h-screen bg-background">
      <AdminNav />
      <main className="p-6">
        <Outlet />
      </main>
    </div>
  )
}
