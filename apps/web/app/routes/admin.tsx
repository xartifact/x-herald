import { Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import AdminNav from '../components/AdminNav'
import { AdminSidebar } from '../components/admin-sidebar'

export function AdminLayout() {
  const [token] = useState(() => localStorage.getItem('admin_token'))
  const [verified, setVerified] = useState(false)

  useEffect(() => {
    if (!token) {
      window.location.href = '/login'
      return
    }

    // Direct fetch — bypass TanStack Query entirely
    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    })
      .then((r) => {
        if (r.ok) setVerified(true)
        else {
          localStorage.removeItem('admin_token')
          window.location.href = '/login'
        }
      })
      .catch(() => {
        setTimeout(() => (window.location.href = '/login'), 3000)
      })
  }, [token])

  if (!token || !verified) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">正在验证身份...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell min-h-screen">
      <AdminSidebar />
      <AdminNav />
      <main className="admin-main min-w-0">
        <Outlet />
      </main>
    </div>
  )
}
