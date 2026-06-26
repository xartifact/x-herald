import { Outlet } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import AdminNav from '../components/AdminNav'

export function AdminLayout() {
  const [token] = useState(() => localStorage.getItem('admin_token'))
  const [verified, setVerified] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!token) { window.location.href = '/login'; return }

    // Direct fetch — bypass TanStack Query entirely
    fetch('/api/auth/me', {
      headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    }).then(r => {
      if (r.ok) setVerified(true)
      else { localStorage.removeItem('admin_token'); window.location.href = '/login' }
    }).catch(() => {
      setTimeout(() => window.location.href = '/login', 3000)
    })
  }, [token])

  if (!token || !verified) {
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
