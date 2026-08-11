import { useState } from 'react'

import { ChevronDown } from 'lucide-react'

import { cn } from '@xartifact/x-llm-gateway-ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@xartifact/x-llm-gateway-ui'

import { navGroups, allNavItems } from './admin-nav-config'
import type { NavGroup } from './admin-nav-config'

/**
 * 判断 `href` 是否是“叶子型”路径——即存在其他菜单项以 `href + '/'` 开头。
 *
 * `/admin` 下有 `/admin/providers`、`/admin/logs` 等其他菜单项，
 * 所以它是公共前缀，不应通过前缀匹配命中。
 * `/admin/logs` 下只有 `/admin/logs/log-detail`（没有独立的菜单项），
 * 所以它不是叶子型，前缀匹配仍然有效。
 */
function isPrefixOnly(href: string): boolean {
  return allNavItems.some((item) => item.href !== href && item.href.startsWith(href + '/'))
}

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => isItemActive(item.href, pathname))
}

function isItemActive(href: string, pathname: string): boolean {
  if (pathname === href) return true
  // 对公共前缀型路径（如 /admin）不做前缀匹配，避免始终高亮
  if (isPrefixOnly(href)) return false
  return pathname.startsWith(href + '/')
}

export function NavDesktopDropdowns() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  return (
    <div className="hidden md:ml-6 md:flex md:space-x-2">
      {navGroups.map((group) => (
        <DropdownMenu
          key={group.label}
          open={openDropdown === group.label}
          onOpenChange={(open) => setOpenDropdown(open ? group.label : null)}
        >
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'inline-flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors',
                isGroupActive(group, pathname)
                  ? 'text-primary bg-primary/10'
                  : 'text-muted-foreground hover:text-foreground hover:bg-accent',
              )}
            >
              {group.icon && <span className="mr-2">{group.icon}</span>}
              {group.label}
              <ChevronDown className="ml-1 h-4 w-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-48">
            {group.items.map((item) => (
              <DropdownMenuItem key={item.href} asChild>
                <a
                  href={item.href}
                  className={cn(
                    'flex items-center cursor-pointer',
                    isItemActive(item.href, pathname) && 'bg-primary/10 text-primary',
                  )}
                  onClick={() => setOpenDropdown(null)}
                >
                  {item.icon && <span className="mr-2">{item.icon}</span>}
                  {item.label}
                </a>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ))}
    </div>
  )
}
