import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { ReactFlowProvider } from '@xyflow/react'
import { useTheme } from 'next-themes'

import type { AccessModelRouteOverview } from '@xartifact/x-herald-shared'

import { RouteOverviewCanvas } from './route-overview-canvas'

vi.mock('next-themes', () => ({
  useTheme: vi.fn(),
}))

const useThemeMock = vi.mocked(useTheme)
type ThemeResult = Parameters<typeof useThemeMock.mockReturnValue>[0]

function renderCanvas(theme: string) {
  useThemeMock.mockReturnValue({ resolvedTheme: theme } as ThemeResult)
  const data: AccessModelRouteOverview = [
    {
      accessModel: { id: 'am-1', name: 'gpt-4', displayName: null, enabled: true },
      rule: null,
      graph: { nodes: [], edges: [] },
    },
  ]
  return render(
    <ReactFlowProvider>
      <RouteOverviewCanvas data={data} />
    </ReactFlowProvider>,
  )
}

describe('RouteOverviewCanvas theme', () => {
  it('uses React Flow dark mode and renders the theme-aware canvas controls', () => {
    const { container } = renderCanvas('dark')

    const flow = container.querySelector('.react-flow')
    expect(flow?.classList.contains('dark')).toBe(true)
    expect(container.querySelector('.react-flow__controls')).toBeTruthy()
    expect(container.querySelector('.react-flow__minimap')).toBeTruthy()
    expect(container.querySelector('.react-flow__background')).toBeTruthy()
  })

  it('switches back to light mode after the theme changes', () => {
    useThemeMock.mockReturnValue({ resolvedTheme: 'dark' } as ThemeResult)
    const data: AccessModelRouteOverview = [
      {
        accessModel: { id: 'am-1', name: 'gpt-4', displayName: null, enabled: true },
        rule: null,
        graph: { nodes: [], edges: [] },
      },
    ]
    const { container, rerender } = render(
      <ReactFlowProvider>
        <RouteOverviewCanvas data={data} />
      </ReactFlowProvider>,
    )
    expect(container.querySelector('.react-flow')?.classList.contains('dark')).toBe(true)
    useThemeMock.mockReturnValue({ resolvedTheme: 'light' } as ThemeResult)
    rerender(
      <ReactFlowProvider>
        <RouteOverviewCanvas data={data} />
      </ReactFlowProvider>,
    )

    expect(container.querySelector('.react-flow')?.classList.contains('dark')).toBe(false)
  })
})
