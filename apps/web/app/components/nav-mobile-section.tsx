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
 * 判断 `href` 是否是“公共前缀型”路径——即存在其他菜单项以 `href + '/'` 开头。
 * 例如 `/admin` 是所有页面的公共前缀，不应通过前缀匹配命中。
 */
function isPrefixOnly(href: string): boolean {
  return allNavItems.some((item) => item.href !== href && item.href.startsWith(href + '/'))
}

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((item) => isItemActive(item.href, pathname))
}

function isItemActive(href: string, pathname: string): boolean {
  if (pathname === href) return true
  if (isPrefixOnly(href)) return false
  return pathname.startsWith(href + '/')
}

export function NavMobileMenu() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''

  return (
    <div className="md:hidden ml-4 flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center px-3 py-2 text-sm font-medium text-muted-foreground hover:text-foreground">
            菜单
            <ChevronDown className="ml-1 h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">
                {group.label}
              </div>
              {group.items.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <a
                    href={item.href}
                    className={cn(
                      'flex items-center cursor-pointer',
                      isItemActive(item.href, pathname) && 'bg-primary/10 text-primary',
                    )}
                  >
                    {item.icon && <span className="mr-2">{item.icon}</span>}
                    {item.label}
                  </a>
                </DropdownMenuItem>
              ))}
            </div>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

export function NavMobileSubnav() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''

  return (
    <div className="md:hidden border-t bg-accent">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex space-x-4 py-2 overflow-x-auto">
          {navGroups
            .filter((group) => isGroupActive(group, pathname))
            .flatMap((group) => group.items)
            .map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap',
                  isItemActive(item.href, pathname)
                    ? 'bg-primary text-white'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                {item.label}
              </a>
            ))}
        </div>
      </div>
    </div>
  )
}
