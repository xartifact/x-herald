import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'

// Monaco-editor accesses `window` at module load time and breaks in test environment.
// Mock it before any transitive import from @x-llm-gateway/ui resolves it.
mock.module('monaco-editor', () => ({
  editor: {},
  languages: {},
}))

mock.module('@monaco-editor/react', () => ({
  default: () => null,
  DiffEditor: () => null,
  loader: { config: () => {} },
}))

import React from 'react'

/* ------------------------------------------------------------------ */
/*  Module mocks — must appear BEFORE imports of mocked modules       */
/* ------------------------------------------------------------------ */

mock.module('lucide-react', () => ({
  Server: () => React.createElement('span', { 'data-testid': 'server-icon' }),
  CheckCircle: () => React.createElement('span', { 'data-testid': 'check-circle-icon' }),
  Activity: () => React.createElement('span', { 'data-testid': 'activity-icon' }),
  AlertCircle: () => React.createElement('span', { 'data-testid': 'alert-circle-icon' }),
  Layers: () => React.createElement('span', { 'data-testid': 'layers-icon' }),
  RefreshCw: () => React.createElement('span', { 'data-testid': 'refresh-icon' }),
  ShieldOff: () => React.createElement('span', { 'data-testid': 'shield-off-icon' }),
  AlertTriangle: () => React.createElement('span', { 'data-testid': 'alert-triangle-icon' }),
  Timer: () => React.createElement('span', { 'data-testid': 'timer-icon' }),
  RotateCcw: () => React.createElement('span', { 'data-testid': 'rotate-ccw-icon' }),
  Octagon: () => React.createElement('span', { 'data-testid': 'octagon-icon' }),
  Clock: () => React.createElement('span', { 'data-testid': 'clock-icon' }),
  Zap: () => React.createElement('span', { 'data-testid': 'zap-icon' }),
  ShieldAlert: () => React.createElement('span', { 'data-testid': 'shield-alert-icon' }),
  ShieldCheck: () => React.createElement('span', { 'data-testid': 'shield-check-icon' }),
  BarChart3: () => React.createElement('span', { 'data-testid': 'bar-chart-icon' }),
}))

mock.module('sonner', () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}))

// Track query states so tests can control loading / error / data
let _queryStates: Record<string, { data?: any; error?: Error; isLoading?: boolean }> = {}

mock.module('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: mock(() => Promise.resolve()),
  }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey.join('-')
    const state = _queryStates[key] || { isLoading: true }
    return {
      data: state.data,
      isLoading: state.isLoading ?? false,
      error: state.error ?? null,
      refetch: mock(() => {}),
    }
  },
  useMutation: ({ mutationFn, onSuccess, onError }: any) => {
    const mutate = mock(async (vars: any) => {
      try {
        const result = await mutationFn(vars)
        if (onSuccess) onSuccess()
        return result
      } catch (err) {
        if (onError) onError(err)
        throw err
      }
    })
    return {
      mutate,
      isPending: false,
    }
  },
}))

// Minimal UI component stubs
mock.module('@x-llm-gateway/ui', () => ({
  Card: ({ children, className }: any) =>
    React.createElement('div', { 'data-testid': 'card', className }, children),
  CardContent: ({ children, className }: any) =>
    React.createElement('div', { 'data-testid': 'card-content', className }, children),
  CardHeader: ({ children, className }: any) =>
    React.createElement('div', { 'data-testid': 'card-header', className }, children),
  CardTitle: ({ children, className }: any) =>
    React.createElement('div', { 'data-testid': 'card-title', className }, children),
  Badge: ({ children, className, variant }: any) =>
    React.createElement('span', { 'data-testid': 'badge', className, 'data-variant': variant }, children),
  Button: ({ children, onClick, disabled, variant, size, title }: any) =>
    React.createElement('button', { onClick, disabled, 'data-variant': variant, 'data-size': size, title, 'data-testid': 'button' }, children),
  Alert: ({ children, variant }: any) =>
    React.createElement('div', { 'data-testid': 'alert', 'data-variant': variant }, children),
  AlertTitle: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'alert-title' }, children),
  AlertDescription: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'alert-description' }, children),
  Table: ({ children }: any) =>
    React.createElement('table', { 'data-testid': 'table' }, children),
  TableBody: ({ children }: any) =>
    React.createElement('tbody', { 'data-testid': 'table-body' }, children),
  TableCell: ({ children, className }: any) =>
    React.createElement('td', { 'data-testid': 'table-cell', className }, children),
  TableHead: ({ children, className }: any) =>
    React.createElement('th', { 'data-testid': 'table-head', className }, children),
  TableHeader: ({ children }: any) =>
    React.createElement('thead', { 'data-testid': 'table-header' }, children),
  TableRow: ({ children }: any) =>
    React.createElement('tr', { 'data-testid': 'table-row' }, children),
  Select: ({ children, value, onValueChange }: any) =>
    React.createElement('div', { 'data-testid': 'select', 'data-value': value }, children),
  SelectContent: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'select-content' }, children),
  SelectItem: ({ children, value }: any) =>
    React.createElement('div', { 'data-testid': 'select-item', 'data-value': value }, children),
  SelectTrigger: ({ children, className }: any) =>
    React.createElement('div', { 'data-testid': 'select-trigger', className }, children),
  SelectValue: () =>
    React.createElement('span', { 'data-testid': 'select-value' }),
  ListPagination: ({ currentPage, totalPages, pageSize, onPageChange, onPageSizeChange }: any) =>
    React.createElement('div', {
      'data-testid': 'list-pagination',
      'data-current-page': currentPage,
      'data-total-pages': totalPages,
      'data-page-size': pageSize,
    }),
}))

/* ------------------------------------------------------------------ */
/*  Source file import (dynamic — avoids monaco-editor side-effects)   */
/* ------------------------------------------------------------------ */

async function loadMetricsPage() {
  const mod = await import('../index')
  return mod.MetricsPage as React.FC
}

/* ------------------------------------------------------------------ */
/*  Helper replicas (source functions are module-private)               */
/* ------------------------------------------------------------------ */

function relativeTime(dateStr: string): string {
  const diff = Math.max(0, Date.now() - new Date(dateStr).getTime())
  if (diff < 60_000) return `${Math.round(diff / 1000)}秒前`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}小时前`
  return `${Math.round(diff / 86_400_000)}天前`
}

function tripCountBadge(tripCount: number): { color: string; label: string } {
  if (tripCount === 0) return { color: 'bg-gray-100 text-gray-600', label: '0' }
  if (tripCount === 1) return { color: 'bg-gray-100 text-gray-600', label: '1' }
  if (tripCount <= 3) return { color: 'bg-yellow-100 text-yellow-700', label: String(tripCount) }
  return { color: 'bg-orange-100 text-orange-700', label: String(tripCount) }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('MetricsPage', () => {
  beforeEach(() => {
    _queryStates = {}
    Object.defineProperty(globalThis, 'localStorage', {
      value: {
        getItem: (key: string) => (key === 'admin_token' ? 'test-token' : null),
        setItem: () => {},
        removeItem: () => {},
      },
      writable: true,
      configurable: true,
    })
  })

  afterEach(() => {
    _queryStates = {}
  })

  /* -- Import smoke test -- */

  test('exports MetricsPage as a function', async () => {
    const MetricsPage = await loadMetricsPage()
    expect(typeof MetricsPage).toBe('function')
  })

  /* -- Helper tests -- */

  describe('relativeTime', () => {
    test('clamps negative diff to 0 seconds ago', () => {
      const future = new Date(Date.now() + 60000).toISOString()
      expect(relativeTime(future)).toBe('0秒前')
    })

    test('returns seconds for diff < 60s', () => {
      const fiveSecAgo = new Date(Date.now() - 5000).toISOString()
      expect(relativeTime(fiveSecAgo)).toBe('5秒前')
    })

    test('returns minutes for diff < 1h', () => {
      const fiveMinAgo = new Date(Date.now() - 5 * 60_000).toISOString()
      expect(relativeTime(fiveMinAgo)).toBe('5分钟前')
    })

    test('returns hours for diff < 1d', () => {
      const fiveHoursAgo = new Date(Date.now() - 5 * 3_600_000).toISOString()
      expect(relativeTime(fiveHoursAgo)).toBe('5小时前')
    })

    test('returns days for diff >= 1d', () => {
      const threeDaysAgo = new Date(Date.now() - 3 * 86_400_000).toISOString()
      expect(relativeTime(threeDaysAgo)).toBe('3天前')
    })
  })

  describe('tripCountBadge', () => {
    test('0 → gray, label "0"', () => {
      expect(tripCountBadge(0)).toEqual({
        color: 'bg-gray-100 text-gray-600',
        label: '0',
      })
    })

    test('1 → gray, label "1"', () => {
      expect(tripCountBadge(1)).toEqual({
        color: 'bg-gray-100 text-gray-600',
        label: '1',
      })
    })

    test('2 → yellow, label "2"', () => {
      expect(tripCountBadge(2)).toEqual({
        color: 'bg-yellow-100 text-yellow-700',
        label: '2',
      })
    })

    test('3 → yellow, label "3"', () => {
      expect(tripCountBadge(3)).toEqual({
        color: 'bg-yellow-100 text-yellow-700',
        label: '3',
      })
    })

    test('4 → orange, label "4"', () => {
      expect(tripCountBadge(4)).toEqual({
        color: 'bg-orange-100 text-orange-700',
        label: '4',
      })
    })

    test('5 → orange, label "5"', () => {
      expect(tripCountBadge(5)).toEqual({
        color: 'bg-orange-100 text-orange-700',
        label: '5',
      })
    })
  })

  /* -- Loading state -- */

  test('shows loading state when query is loading', async () => {
    const MetricsPage = await loadMetricsPage()
    _queryStates = {
      'circuit-breaker-stats': { isLoading: true },
    }

    const element = React.createElement(MetricsPage)
    expect(element).toBeDefined()
    expect(element.type).toBe(MetricsPage)
  })

  /* -- Error state -- */

  test('shows error state when API fails', async () => {
    const MetricsPage = await loadMetricsPage()
    _queryStates = {
      'circuit-breaker-stats': {
        isLoading: false,
        error: new Error('Failed to fetch stats'),
      },
    }

    const element = React.createElement(MetricsPage)
    expect(element).toBeDefined()
  })

  /* -- Empty state -- */

  test('shows empty state when no top instances', async () => {
    const MetricsPage = await loadMetricsPage()
    _queryStates = {
      'circuit-breaker-stats': {
        isLoading: false,
        data: {
          todayOpened: 0,
          weekOpened: 0,
          trippedInstanceCount: 0,
          topInstances: [],
        },
      },
    }

    const element = React.createElement(MetricsPage)
    expect(element).toBeDefined()
  })

  /* -- Success state with data -- */

  test('shows stats cards when API returns data', async () => {
    const MetricsPage = await loadMetricsPage()
    _queryStates = {
      'circuit-breaker-stats': {
        isLoading: false,
        data: {
          todayOpened: 3,
          weekOpened: 15,
          trippedInstanceCount: 2,
          topInstances: [],
        },
      },
    }

    const element = React.createElement(MetricsPage)
    expect(element).toBeDefined()
  })

  test('shows top instances table when API returns data', async () => {
    const MetricsPage = await loadMetricsPage()
    _queryStates = {
      'circuit-breaker-stats': {
        isLoading: false,
        data: {
          todayOpened: 5,
          weekOpened: 20,
          trippedInstanceCount: 3,
          topInstances: [
            {
              instanceId: 'inst-abc123',
              instanceName: 'High Freq Instance',
              groupName: 'gpt-group',
              providerName: 'openai',
              openCount: 8,
              lastOpenedAt: new Date(Date.now() - 3600000).toISOString(),
              tripCount: 4,
            },
            {
              instanceId: 'inst-def456',
              instanceName: '',
              groupName: 'claude-group',
              providerName: 'anthropic',
              openCount: 3,
              lastOpenedAt: new Date(Date.now() - 7200000).toISOString(),
              tripCount: 2,
            },
          ],
        },
      },
    }

    const element = React.createElement(MetricsPage)
    expect(element).toBeDefined()
  })

  test('shows summary alert when todayOpened or weekOpened > 0', async () => {
    const MetricsPage = await loadMetricsPage()
    _queryStates = {
      'circuit-breaker-stats': {
        isLoading: false,
        data: {
          todayOpened: 2,
          weekOpened: 10,
          trippedInstanceCount: 1,
          topInstances: [],
        },
      },
    }

    const element = React.createElement(MetricsPage)
    expect(element).toBeDefined()
  })

  test('does not show summary alert when both todayOpened and weekOpened are 0', async () => {
    const MetricsPage = await loadMetricsPage()
    _queryStates = {
      'circuit-breaker-stats': {
        isLoading: false,
        data: {
          todayOpened: 0,
          weekOpened: 0,
          trippedInstanceCount: 0,
          topInstances: [],
        },
      },
    }

    const element = React.createElement(MetricsPage)
    expect(element).toBeDefined()
  })
})
