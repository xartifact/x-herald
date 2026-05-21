'use client'

import { LogOut } from 'lucide-react'
import { usePathname } from 'next/navigation'

import { APP_VERSION } from '@/core/config/env'
import { useLogout } from '@/features/auth/useAuth'
import { Button } from '@x-llm-gateway/ui'

import { allNavItems } from './admin-nav-config'
import { NavDesktopDropdowns } from './nav-desktop-dropdowns'
import { NavMobileMenu, NavMobileSubnav } from './nav-mobile-section'

export default function AdminNav() {
  const pathname = usePathname()
  const logout = useLogout()

  const currentLabel = allNavItems.find(
    item => pathname === item.href || pathname.startsWith(item.href + '/')
  )?.label

  return (
    <nav className="bg-white shadow-sm border-b">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-gray-900">x-llm-gateway</h1>
            </div>
            <NavDesktopDropdowns />
            <NavMobileMenu />
          </div>

          <div className="flex items-center space-x-4">
            <span className="hidden md:block text-sm text-muted-foreground">{currentLabel}</span>
            {APP_VERSION !== 'dev' && (
              <span className="hidden md:block text-xs text-muted-foreground/60 font-mono">
                v{APP_VERSION}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => logout.mutate()} disabled={logout.isPending}>
              <LogOut className="mr-2 h-4 w-4" />
              {logout.isPending ? '退出中...' : '退出'}
            </Button>
          </div>
        </div>
      </div>
      <NavMobileSubnav />
    </nav>
  )
}
