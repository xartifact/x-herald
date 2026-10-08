import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import React from 'react'
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query'

vi.mock('next-themes', () => ({
  useTheme: () => ({ setTheme: vi.fn() }),
}))

vi.mock('@xartifact/x-herald-shared', async (importOriginal) => ({
  ...(await importOriginal()),
  APP_VERSION: '0.1.1',
  GIT_COMMIT_HASH: 'deadbee',
  BUILD_REF: 'v0.1.1',
}))

vi.mock('./admin-nav-config', () => ({ allNavItems: [] }))
vi.mock('./nav-desktop-dropdowns', () => ({ NavDesktopDropdowns: () => null }))
vi.mock('./nav-mobile-section', () => ({
  NavMobileMenu: () => null,
  NavMobileSubnav: () => null,
}))
vi.mock('./locale-switcher', () => ({ LocaleSwitcher: () => null }))
vi.mock('@xartifact/x-herald-ui', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@xartifact/x-herald-ui')>()),
  get: vi.fn(async () => [
    { id: 'workspace-default', name: 'Default', isDefault: true },
    { id: 'workspace-team', name: 'Team', isDefault: false },
  ]),
}))

import AdminNav from './AdminNav'

const localStorageValues = new Map<string, string>()

beforeEach(() => {
  localStorageValues.clear()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => localStorageValues.get(key) ?? null,
    setItem: (key: string, value: string) => localStorageValues.set(key, value),
    removeItem: (key: string) => localStorageValues.delete(key),
  })
})

describe('AdminNav build identity', () => {
  it('shows version, commit, and release ref in the desktop header', () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={queryClient}>
        <AdminNav />
      </QueryClientProvider>,
    )

    expect(screen.getByText('v0.1.1')).toBeTruthy()
    expect(screen.getByText('deadbee')).toBeTruthy()
    expect(screen.getByText('@v0.1.1')).toBeTruthy()
    expect(screen.getByTitle('x-herald 0.1.1 (commit deadbee, ref v0.1.1)')).toBeTruthy()
  })

  it('switches workspace and refreshes active SPA queries without leaving the current route', async () => {
    window.history.pushState({}, '', '/admin')
    localStorage.setItem('active_workspace_id', 'workspace-default')
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const queryFn = vi.fn(async () => 'fresh data')
    function ActiveQueryProbe() {
      useQuery({ queryKey: ['active-workspace-probe'], queryFn })
      return null
    }

    render(
      <QueryClientProvider client={queryClient}>
        <ActiveQueryProbe />
        <AdminNav />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(1))
    const user = userEvent.setup()
    await user.click(await screen.findByRole('button', { name: '切换 workspace' }))
    await user.click(await screen.findByRole('menuitem', { name: /Team/ }))

    await waitFor(() => expect(queryFn).toHaveBeenCalledTimes(2))
    expect(localStorage.getItem('active_workspace_id')).toBe('workspace-team')
    expect(window.location.pathname).toBe('/admin')
    expect(screen.getByText('Team')).toBeTruthy()
  })
})
