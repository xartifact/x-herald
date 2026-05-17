'use client'

import { ChevronDown } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/core/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/ui/dropdown-menu'

import { navGroups } from './admin-nav-config'
import type { NavGroup } from './admin-nav-config'

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))
}

function isItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
}

export function NavMobileMenu() {
  const pathname = usePathname()

  return (
    <div className="md:hidden ml-4 flex items-center">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="inline-flex items-center px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900">
            菜单
            <ChevronDown className="ml-1 h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {navGroups.map((group) => (
            <div key={group.label}>
              <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">{group.label}</div>
              {group.items.map((item) => (
                <DropdownMenuItem key={item.href} asChild>
                  <Link
                    href={item.href}
                    className={cn('flex items-center cursor-pointer', isItemActive(item.href, pathname) && 'bg-primary/10 text-primary')}
                  >
                    {item.icon && <span className="mr-2">{item.icon}</span>}
                    {item.label}
                  </Link>
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
  const pathname = usePathname()

  return (
    <div className="md:hidden border-t bg-gray-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex space-x-4 py-2 overflow-x-auto">
          {navGroups
            .filter(group => isGroupActive(group, pathname))
            .flatMap(group => group.items)
            .map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md whitespace-nowrap',
                  isItemActive(item.href, pathname) ? 'bg-primary text-white' : 'text-gray-600 hover:bg-gray-200'
                )}
              >
                {item.label}
              </Link>
            ))}
        </div>
      </div>
    </div>
  )
}
