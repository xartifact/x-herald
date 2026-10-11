import React from 'react'
import { LogOut, Pencil, Plus, Trash2, Layers } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'

import { APP_VERSION, BUILD_REF, GIT_COMMIT_HASH } from '@xartifact/x-herald-shared'

import { Button, AppearanceControls } from '@xartifact/x-herald-ui'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@xartifact/x-herald-ui'
import { del, get, post, put } from '@xartifact/x-herald-ui'
import type { Workspace } from '@xartifact/x-herald-shared'

import { allNavItems } from './admin-nav-config'
import { NavMobileMenu, NavMobileSubnav } from './nav-mobile-section'
import { LocaleSwitcher } from './locale-switcher'

function WorkspaceSwitcher() {
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([])
  const [activeId, setActiveId] = React.useState('')
  const queryClient = useQueryClient()
  const refreshWorkspaceData = React.useCallback(() => {
    queryClient.removeQueries({ queryKey: [], type: 'inactive' })
    void queryClient.resetQueries({ queryKey: [], type: 'active' })
  }, [queryClient])

  React.useEffect(() => {
    const storedId = localStorage.getItem('active_workspace_id') ?? ''
    setActiveId(storedId)
    void get<Workspace[]>('/api/workspaces')
      .then((rows) => {
        setWorkspaces(rows)
        if (!rows.some((row) => row.id === storedId)) {
          const defaultWorkspace = rows.find((row) => row.isDefault) ?? rows[0]
          if (defaultWorkspace) {
            localStorage.setItem('active_workspace_id', defaultWorkspace.id)
            setActiveId(defaultWorkspace.id)
            if (storedId) {
              window.dispatchEvent(new Event('workspace-changed'))
              refreshWorkspaceData()
            }
          }
        }
      })
      .catch(() => {})
  }, [queryClient, refreshWorkspaceData])

  const active = workspaces.find((workspace) => workspace.id === activeId)
  const refresh = async () => setWorkspaces(await get<Workspace[]>('/api/workspaces'))
  const switchTo = (id: string) => {
    if (id === activeId) return
    localStorage.setItem('active_workspace_id', id)
    setActiveId(id)
    window.dispatchEvent(new Event('workspace-changed'))
    refreshWorkspaceData()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" aria-label="切换 workspace" className="max-w-44">
          <Layers className="mr-2 h-4 w-4 shrink-0" />
          <span className="truncate">{active?.name ?? 'Workspace'}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {workspaces.map((workspace) => (
          <DropdownMenuItem key={workspace.id} onClick={() => switchTo(workspace.id)}>
            <span className="flex-1 truncate">{workspace.name}</span>
            {workspace.id === activeId ? <span aria-label="当前 workspace">✓</span> : null}
          </DropdownMenuItem>
        ))}
        <DropdownMenuItem
          onClick={async () => {
            const name = window.prompt('新 workspace 名称')?.trim()
            if (!name) return
            try {
              const created = await post<Workspace>('/api/workspaces', { name })
              await refresh()
              switchTo(created.id)
            } catch (error) {
              window.alert(error instanceof Error ? error.message : '创建 workspace 失败')
            }
          }}
        >
          <Plus className="mr-2 h-4 w-4" /> 新建 workspace
        </DropdownMenuItem>
        {active ? (
          <>
            <DropdownMenuItem
              onClick={async () => {
                const name = window.prompt('Workspace 名称', active.name)?.trim()
                if (!name || name === active.name) return
                try {
                  await put(`/api/workspaces/${active.id}`, { name })
                  await refresh()
                } catch (error) {
                  window.alert(error instanceof Error ? error.message : '重命名失败')
                }
              }}
            >
              <Pencil className="mr-2 h-4 w-4" /> 重命名当前 workspace
            </DropdownMenuItem>
            {!active.isDefault ? (
              <DropdownMenuItem
                onClick={async () => {
                  if (!window.confirm(`删除空 workspace「${active.name}」？`)) return
                  try {
                    await del(`/api/workspaces/${active.id}`)
                    const rows = await get<Workspace[]>('/api/workspaces')
                    setWorkspaces(rows)
                    const fallback = rows.find((workspace) => workspace.isDefault) ?? rows[0]
                    if (fallback) switchTo(fallback.id)
                  } catch (error) {
                    window.alert(
                      error instanceof Error ? error.message : '删除失败；只能删除空 workspace',
                    )
                  }
                }}
              >
                <Trash2 className="mr-2 h-4 w-4" /> 删除当前 workspace
              </DropdownMenuItem>
            ) : null}
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default function AdminNav() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : ''

  const currentLabel = allNavItems.find(
    (item) =>
      pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href + '/')),
  )?.label

  return (
    <nav className="admin-topbar border-b bg-background">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="admin-topbar-content flex justify-between min-h-16">
          <div className="flex">
            <div className="shrink-0 flex items-center lg:hidden">
              <h1 className="text-xl font-bold text-foreground">x-herald</h1>
            </div>

            <NavMobileMenu />
          </div>

          <div className="admin-topbar-controls flex items-center gap-2">
            <span className="hidden md:block text-sm text-muted-foreground">{currentLabel}</span>
            <WorkspaceSwitcher />
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
            <AppearanceControls />
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
