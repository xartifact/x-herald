import { LogOut, Moon, Sun, Monitor } from 'lucide-react'
import { useTheme } from 'next-themes'

import { APP_VERSION, BUILD_REF, GIT_COMMIT_HASH } from '@xartifact/x-herald-shared'

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
import { LocaleSwitcher } from './locale-switcher'

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
            {/* 构建版本始终渲染，值为兜底时也显示 dev/unknown —— 版本区整体消失会
                让「镜像没注入版本」这类发布问题变得不可见（此前正是如此：条件渲染
                把故障藏了几个月）。显式的 dev/unknown 本身就是诊断信号。 */}
            <span
              className="hidden md:flex items-center gap-1.5 text-xs text-muted-foreground/60 font-mono"
              title={`x-herald ${APP_VERSION} (commit ${GIT_COMMIT_HASH}, ref ${BUILD_REF})`}
            >
              <span>{APP_VERSION === 'dev' ? 'dev' : `v${APP_VERSION}`}</span>
              <span aria-hidden="true">·</span>
              <span>{GIT_COMMIT_HASH}</span>
              <span aria-hidden="true">·</span>
              <span>@{BUILD_REF}</span>
            </span>
            <LocaleSwitcher />
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
