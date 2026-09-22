import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import React from 'react'

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

import AdminNav from './AdminNav'

describe('AdminNav build identity', () => {
  it('shows version, commit, and release ref in the desktop header', () => {
    render(<AdminNav />)

    expect(screen.getByText('v0.1.1')).toBeTruthy()
    expect(screen.getByText('deadbee')).toBeTruthy()
    expect(screen.getByText('@v0.1.1')).toBeTruthy()
    expect(screen.getByTitle('x-herald 0.1.1 (commit deadbee, ref v0.1.1)')).toBeTruthy()
  })
})
