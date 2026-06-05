'use client'

import { useState } from 'react'

import { ChevronDown } from 'lucide-react'
import { Link } from '@tanstack/react-router'


import { cn } from '../../../shared/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../../../shared/components/ui/dropdown-menu'

import { navGroups } from './admin-nav-config'
import type { NavGroup } from './admin-nav-config'

function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some(item => pathname === item.href || pathname.startsWith(item.href + '/'))
}

function isItemActive(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(href + '/')
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
                  : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
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
                  className={cn('flex items-center cursor-pointer', isItemActive(item.href, pathname) && 'bg-primary/10 text-primary')}
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
