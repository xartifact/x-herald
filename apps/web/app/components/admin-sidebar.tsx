import { Link, useRouterState } from '@tanstack/react-router'
import { Radio } from 'lucide-react'

import { navGroups } from './admin-nav-config'

export function AdminSidebar() {
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  return (
    <aside className="admin-sidebar">
      <Link to="/admin" className="admin-brand">
        <span>
          <Radio size={22} />
        </span>
        <strong className="whitespace-nowrap text-lg font-semibold">x-herald</strong>
      </Link>
      <p className="px-3 pb-5 text-xs text-muted-foreground">模型资源，统一管理</p>
      <nav aria-label="管理导航" className="min-h-0 flex-1 overflow-y-auto">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-5">
            <p className="px-3 pb-2 text-xs text-muted-foreground">{group.label}</p>
            {group.items.map((item) => {
              const active =
                item.href === '/admin'
                  ? pathname === item.href
                  : pathname === item.href || pathname.startsWith(item.href + '/')
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  activeOptions={{ exact: true }}
                  aria-current={active ? 'page' : undefined}
                  className={`admin-nav-link ${active ? 'active' : ''}`}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </Link>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="border-t px-3 py-4 text-xs text-muted-foreground">
        xartifact / model infrastructure
      </div>
    </aside>
  )
}
