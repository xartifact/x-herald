import { LogOut, Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'

import { APP_VERSION, GIT_COMMIT_HASH } from '@xartifact/x-herald-shared'

import { Button } from '@xartifact/x-herald-ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@xartifact/x-herald-ui'

import { allNavItems } from './admin-nav-config'
import { NavDesktopDropdowns } from './nav-desktop-dropdowns'
import { NavMobileMenu, NavMobileSubnav } from './nav-mobile-section'

function ThemeToggle() {
  const { setTheme } = useTheme()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="切换主题">
          <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => setTheme('light')}>
          <Sun className="mr-2 h-4 w-4" />
          亮色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('dark')}>
          <Moon className="mr-2 h-4 w-4" />
          暗色
        </DropdownMenuItem>
        <DropdownMenuItem onClick={() => setTheme('system')}>
          <Monitor className="mr-2 h-4 w-4" />
          跟随系统
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function AdminNav() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''

  const currentLabel = allNavItems.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + '/'),
  )?.label

  return (
    <nav className="bg-background shadow-sm border-b">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="shrink-0 flex items-center">
              <h1 className="text-xl font-bold text-foreground">x-herald</h1>
            </div>
            <NavDesktopDropdowns />
            <NavMobileMenu />
          </div>

          <div className="flex items-center space-x-4">
            <span className="hidden md:block text-sm text-muted-foreground">{currentLabel}</span>
            {(APP_VERSION !== 'dev' || GIT_COMMIT_HASH !== 'unknown') && (
              <span className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground/60 font-mono">
                {APP_VERSION !== 'dev' && <span>v{APP_VERSION}</span>}
                {APP_VERSION !== 'dev' && GIT_COMMIT_HASH !== 'unknown' && (
                  <span aria-hidden="true">·</span>
                )}
                {GIT_COMMIT_HASH !== 'unknown' && (
                  <span title={`commit ${GIT_COMMIT_HASH}`}>{GIT_COMMIT_HASH}</span>
                )}
              </span>
            )}
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                localStorage.removeItem('admin_token')
                window.location.href = '/login'
              }}
            >
              <LogOut className="mr-2 h-4 w-4" />
              退出
            </Button>
          </div>
        </div>
      </div>
      <NavMobileSubnav />
    </nav>
  )
}
