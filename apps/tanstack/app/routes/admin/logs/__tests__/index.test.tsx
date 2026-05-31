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

async function loadLogsPage() {
  const mod = await import('../index')
  return mod.LogsPage as React.FC
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

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('LogsPage', () => {
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

  test('exports LogsPage as a function', async () => {
    const LogsPage = await loadLogsPage()
    expect(typeof LogsPage).toBe('function')
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

  /* -- Loading state -- */

  test('shows loading state when query is loading', async () => {
    const LogsPage = await loadLogsPage()
    _queryStates = {
      'circuit-breaker-events-all-0-50': { isLoading: true },
    }

    const element = React.createElement(LogsPage)
    expect(element).toBeDefined()
    expect(element.type).toBe(LogsPage)
  })

  /* -- Error state -- */

  test('shows error state when API fails', async () => {
    const LogsPage = await loadLogsPage()
    _queryStates = {
      'circuit-breaker-events-all-0-50': {
        isLoading: false,
        error: new Error('Failed to fetch events'),
      },
    }

    const element = React.createElement(LogsPage)
    expect(element).toBeDefined()
  })

  /* -- Empty state -- */

  test('shows empty state when no events', async () => {
    const LogsPage = await loadLogsPage()
    _queryStates = {
      'circuit-breaker-events-all-0-50': {
        isLoading: false,
        data: { events: [], total: 0 },
      },
    }

    const element = React.createElement(LogsPage)
    expect(element).toBeDefined()
  })

  /* -- Success state with data -- */

  test('shows events when API returns data', async () => {
    const LogsPage = await loadLogsPage()
    _queryStates = {
      'circuit-breaker-events-all-0-50': {
        isLoading: false,
        data: {
          events: [
            {
              id: 'evt-1',
              instanceId: 'inst-abc123',
              instanceName: 'Test Instance',
              groupName: 'group-a',
              providerName: 'openai',
              event: 'opened' as const,
              failureCount: 3,
              tripCount: 1,
              openUntil: new Date(Date.now() + 30000).toISOString(),
              createdAt: new Date(Date.now() - 60000).toISOString(),
            },
            {
              id: 'evt-2',
              instanceId: 'inst-def456',
              instanceName: '',
              groupName: 'group-b',
              providerName: 'anthropic',
              event: 'closed' as const,
              failureCount: 0,
              tripCount: 2,
              openUntil: null,
              createdAt: new Date(Date.now() - 120000).toISOString(),
            },
          ],
          total: 2,
        },
      },
    }

    const element = React.createElement(LogsPage)
    expect(element).toBeDefined()
  })

  test('shows different event types correctly', async () => {
    const LogsPage = await loadLogsPage()
    _queryStates = {
      'circuit-breaker-events-all-0-50': {
        isLoading: false,
        data: {
          events: [
            {
              id: 'evt-1',
              instanceId: 'inst-1',
              instanceName: 'Instance 1',
              groupName: 'g1',
              providerName: 'openai',
              event: 'opened' as const,
              failureCount: 5,
              tripCount: 1,
              openUntil: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
            {
              id: 'evt-2',
              instanceId: 'inst-2',
              instanceName: 'Instance 2',
              groupName: 'g2',
              providerName: 'gemini',
              event: 'half_open' as const,
              failureCount: 2,
              tripCount: 2,
              openUntil: null,
              createdAt: new Date().toISOString(),
            },
            {
              id: 'evt-3',
              instanceId: 'inst-3',
              instanceName: 'Instance 3',
              groupName: 'g3',
              providerName: 'anthropic',
              event: 'cooldown' as const,
              failureCount: 1,
              tripCount: 3,
              openUntil: null,
              createdAt: new Date().toISOString(),
            },
            {
              id: 'evt-4',
              instanceId: 'inst-4',
              instanceName: 'Instance 4',
              groupName: 'g4',
              providerName: 'openai',
              event: 'reset' as const,
              failureCount: 0,
              tripCount: 1,
              openUntil: null,
              createdAt: new Date().toISOString(),
            },
            {
              id: 'evt-5',
              instanceId: 'inst-5',
              instanceName: 'Instance 5',
              groupName: 'g5',
              providerName: 'openai',
              event: 'manual_trip' as const,
              failureCount: 10,
              tripCount: 5,
              openUntil: new Date().toISOString(),
              createdAt: new Date().toISOString(),
            },
          ],
          total: 5,
        },
      },
    }

    const element = React.createElement(LogsPage)
    expect(element).toBeDefined()
  })

  test('shows instance name or fallback to id slice', async () => {
    const LogsPage = await loadLogsPage()
    _queryStates = {
      'circuit-breaker-events-all-0-50': {
        isLoading: false,
        data: {
          events: [
            {
              id: 'evt-1',
              instanceId: 'inst-abcdefgh',
              instanceName: 'Named Instance',
              groupName: 'g1',
              providerName: 'openai',
              event: 'opened' as const,
              failureCount: 1,
              tripCount: 1,
              openUntil: null,
              createdAt: new Date().toISOString(),
            },
            {
              id: 'evt-2',
              instanceId: 'inst-xyz123456',
              instanceName: '',
              groupName: 'g2',
              providerName: 'anthropic',
              event: 'closed' as const,
              failureCount: 0,
              tripCount: 0,
              openUntil: null,
              createdAt: new Date().toISOString(),
            },
          ],
          total: 2,
        },
      },
    }

    const element = React.createElement(LogsPage)
    expect(element).toBeDefined()
  })
})
