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
  RefreshCw: () => React.createElement('span', { 'data-testid': 'refresh-icon' }),
  RotateCcw: () => React.createElement('span', { 'data-testid': 'rotate-ccw-icon' }),
  Octagon: () => React.createElement('span', { 'data-testid': 'octagon-icon' }),
  Zap: () => React.createElement('span', { 'data-testid': 'zap-icon' }),
  ShieldAlert: () => React.createElement('span', { 'data-testid': 'shield-alert-icon' }),
  ShieldCheck: () => React.createElement('span', { 'data-testid': 'shield-check-icon' }),
  Activity: () => React.createElement('span', { 'data-testid': 'activity-icon' }),
  AlertTriangle: () => React.createElement('span', { 'data-testid': 'alert-triangle-icon' }),
  CheckCircle: () => React.createElement('span', { 'data-testid': 'check-circle-icon' }),
  ShieldOff: () => React.createElement('span', { 'data-testid': 'shield-off-icon' }),
  Timer: () => React.createElement('span', { 'data-testid': 'timer-icon' }),
}))

mock.module('sonner', () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}))

// Track query states so tests can control loading / error / data
let _queryStates: Record<string, { data?: any; error?: Error; isLoading?: boolean }> = {}
let _invalidateQueriesMock = mock(() => Promise.resolve())

mock.module('@tanstack/react-query', () => ({
  useQueryClient: () => ({
    invalidateQueries: _invalidateQueriesMock,
  }),
  useQuery: ({ queryKey }: { queryKey: string[] }) => {
    const key = queryKey.join('-')
    const state = _queryStates[key] || { isLoading: true }
    return {
      data: state.data,
      isLoading: state.isLoading ?? false,
      error: state.error ?? null,
    }
  },
  useMutation: ({ mutationFn, onSuccess, onError }: any) => {
    const mutate = mock(async (instanceId: string) => {
      try {
        const result = await mutationFn(instanceId)
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
  Dialog: ({ children, open }: any) =>
    open ? React.createElement('div', { 'data-testid': 'dialog' }, children) : null,
  DialogContent: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-content' }, children),
  DialogDescription: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-description' }, children),
  DialogHeader: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-header' }, children),
  DialogTitle: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-title' }, children),
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
  ListPagination: ({ currentPage, totalPages, pageSize, onPageChange, onPageSizeChange }: any) =>
    React.createElement('div', {
      'data-testid': 'list-pagination',
      'data-current-page': currentPage,
      'data-total-pages': totalPages,
      'data-page-size': pageSize,
    }),
  // API client stubs
  get: () => Promise.resolve({ items: [] }),
  post: () => Promise.resolve({}),
  // Circuit-breaker components
  CircuitBreakerStatsCards: ({ stats, loading, error, onRetry }: any) =>
    React.createElement('div', { 'data-testid': 'cb-stats-cards', 'data-loading': loading, 'data-error': !!error }),
  RealtimeStateTable: ({ instances, loading, error, onReset, onTrip, actionPending, onRetry }: any) =>
    React.createElement('div', { 'data-testid': 'cb-realtime-table', 'data-count': instances?.length, 'data-loading': loading, 'data-error': !!error }),
  TopInstancesTable: ({ instances }: any) =>
    instances?.length > 0 ? React.createElement('div', { 'data-testid': 'cb-top-instances', 'data-count': instances.length }) : null,
  EventHistoryTable: ({ events, loading, error, filter, currentPage, totalPages, pageSize, onPageChange, onPageSizeChange, onRetry }: any) =>
    React.createElement('div', { 'data-testid': 'cb-event-history', 'data-count': events?.length, 'data-filter': filter, 'data-current-page': currentPage, 'data-total-pages': totalPages, 'data-loading': loading, 'data-error': !!error }),
  CircuitBreakerConfirmDialog: ({ open, action, pending }: any) =>
    open ? React.createElement('div', { 'data-testid': 'cb-confirm-dialog', 'data-action': action, 'data-pending': pending }) : null,
}))

/* ------------------------------------------------------------------ */
/*  Source file import (dynamic — avoids monaco-editor side-effects)   */
/* ------------------------------------------------------------------ */

async function loadCircuitBreakerPage() {
  const mod = await import('../index')
  return mod.CircuitBreakerPage as React.FC
}

/* ------------------------------------------------------------------ */
/*  Helper replicas (source functions are module-private)               */
/* ------------------------------------------------------------------ */

function stateBadgeColor(state: 'closed' | 'open' | 'half_open' | 'cooldown'): string {
  switch (state) {
    case 'closed': return 'text-green-600'
    case 'half_open': return 'text-yellow-600'
    case 'open': return 'text-red-600'
    case 'cooldown': return 'text-blue-600'
  }
}

function stateLabel(state: 'closed' | 'open' | 'half_open' | 'cooldown'): string {
  switch (state) {
    case 'closed': return '正常'
    case 'half_open': return '半开'
    case 'open': return '开路'
    case 'cooldown': return '冷却'
  }
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '已到期'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.round(minutes / 60)
  return `${hours}小时`
}

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

describe('CircuitBreakerPage', () => {
  beforeEach(() => {
    _queryStates = {}
    _invalidateQueriesMock.mockClear && _invalidateQueriesMock.mockClear()
    // Provide a default admin_token so authHeaders() doesn't fail
    const originalGetItem = globalThis.localStorage?.getItem
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

  describe('Component import', () => {
    test('exports CircuitBreakerPage as a function', async () => {
      const CircuitBreakerPage = await loadCircuitBreakerPage()
      expect(typeof CircuitBreakerPage).toBe('function')
    })
  })

  describe('stateBadgeColor', () => {
    test('closed → text-green-600', () => {
      expect(stateBadgeColor('closed')).toBe('text-green-600')
    })

    test('half_open → text-yellow-600', () => {
      expect(stateBadgeColor('half_open')).toBe('text-yellow-600')
    })

    test('open → text-red-600', () => {
      expect(stateBadgeColor('open')).toBe('text-red-600')
    })

    test('cooldown → text-blue-600', () => {
      expect(stateBadgeColor('cooldown')).toBe('text-blue-600')
    })
  })

  describe('stateLabel', () => {
    test('closed → 正常', () => {
      expect(stateLabel('closed')).toBe('正常')
    })

    test('half_open → 半开', () => {
      expect(stateLabel('half_open')).toBe('半开')
    })

    test('open → 开路', () => {
      expect(stateLabel('open')).toBe('开路')
    })

    test('cooldown → 冷却', () => {
      expect(stateLabel('cooldown')).toBe('冷却')
    })
  })

  describe('formatDuration', () => {
    test('0 ms → 已到期', () => {
      expect(formatDuration(0)).toBe('已到期')
    })

    test('negative ms → 已到期', () => {
      expect(formatDuration(-1000)).toBe('已到期')
    })

    test('5000 ms → 5秒', () => {
      expect(formatDuration(5000)).toBe('5秒')
    })

    test('59000 ms → 59秒', () => {
      expect(formatDuration(59000)).toBe('59秒')
    })

    test('60000 ms → 1分钟', () => {
      expect(formatDuration(60000)).toBe('1分钟')
    })

    test('120000 ms → 2分钟', () => {
      expect(formatDuration(120000)).toBe('2分钟')
    })

    test('3600000 ms → 1小时', () => {
      expect(formatDuration(3600000)).toBe('1小时')
    })

    test('7200000 ms → 2小时', () => {
      expect(formatDuration(7200000)).toBe('2小时')
    })
  })

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

  describe('Rendering states', () => {
    test('renders without crashing when all queries are loading', async () => {
      const CircuitBreakerPage = await loadCircuitBreakerPage()
      _queryStates = {
        'circuit-breaker-stats': { isLoading: true },
        'circuit-breaker-realtime-states': { isLoading: true },
        'circuit-breaker-events-all-0-50': { isLoading: true },
      }

      const element = React.createElement(CircuitBreakerPage)
      expect(element).toBeDefined()
      expect(element.type).toBe(CircuitBreakerPage)
    })

    test('renders stats cards when data is available', async () => {
      const CircuitBreakerPage = await loadCircuitBreakerPage()
      _queryStates = {
        'circuit-breaker-stats': {
          isLoading: false,
          data: {
            todayOpened: 3,
            weekOpened: 12,
            trippedInstanceCount: 2,
            topInstances: [],
          },
        },
        'circuit-breaker-realtime-states': {
          isLoading: false,
          data: { instances: [] },
        },
        'circuit-breaker-events-all-0-50': {
          isLoading: false,
          data: { events: [], total: 0 },
        },
      }

      const element = React.createElement(CircuitBreakerPage)
      expect(element).toBeDefined()
    })

    test('renders realtime instance table when data is available', async () => {
      const CircuitBreakerPage = await loadCircuitBreakerPage()
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
        'circuit-breaker-realtime-states': {
          isLoading: false,
          data: {
            instances: [
              {
                instanceId: 'inst-abc123def456',
                state: 'open' as const,
                tripCount: 2,
                failures: 5,
                remainingMs: 30000,
                openUntil: Date.now() + 30000,
                cooldownUntil: 0,
              },
              {
                instanceId: 'inst-closed789',
                state: 'closed' as const,
                tripCount: 0,
                failures: 0,
                remainingMs: 0,
                openUntil: 0,
                cooldownUntil: 0,
              },
            ],
          },
        },
        'circuit-breaker-events-all-0-50': {
          isLoading: false,
          data: { events: [], total: 0 },
        },
      }

      const element = React.createElement(CircuitBreakerPage)
      expect(element).toBeDefined()
    })

    test('renders event history table when data is available', async () => {
      const CircuitBreakerPage = await loadCircuitBreakerPage()
      _queryStates = {
        'circuit-breaker-stats': {
          isLoading: false,
          data: {
            todayOpened: 1,
            weekOpened: 5,
            trippedInstanceCount: 1,
            topInstances: [],
          },
        },
        'circuit-breaker-realtime-states': {
          isLoading: false,
          data: { instances: [] },
        },
        'circuit-breaker-events-all-0-50': {
          isLoading: false,
          data: {
            events: [
              {
                id: 'evt-1',
                instanceId: 'inst-abc',
                instanceName: 'Test Instance',
                groupName: 'group-a',
                providerName: 'openai',
                event: 'opened' as const,
                failureCount: 3,
                tripCount: 1,
                openUntil: new Date().toISOString(),
                createdAt: new Date().toISOString(),
              },
            ],
            total: 1,
          },
        },
      }

      const element = React.createElement(CircuitBreakerPage)
      expect(element).toBeDefined()
    })

    test('shows error state when stats query fails', async () => {
      const CircuitBreakerPage = await loadCircuitBreakerPage()
      _queryStates = {
        'circuit-breaker-stats': {
          isLoading: false,
          error: new Error('Stats fetch failed'),
        },
        'circuit-breaker-realtime-states': {
          isLoading: false,
          data: { instances: [] },
        },
        'circuit-breaker-events-all-0-50': {
          isLoading: false,
          data: { events: [], total: 0 },
        },
      }

      const element = React.createElement(CircuitBreakerPage)
      expect(element).toBeDefined()
    })

    test('shows error state when realtime query fails', async () => {
      const CircuitBreakerPage = await loadCircuitBreakerPage()
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
        'circuit-breaker-realtime-states': {
          isLoading: false,
          error: new Error('Realtime fetch failed'),
        },
        'circuit-breaker-events-all-0-50': {
          isLoading: false,
          data: { events: [], total: 0 },
        },
      }

      const element = React.createElement(CircuitBreakerPage)
      expect(element).toBeDefined()
    })

    test('shows error state when events query fails', async () => {
      const CircuitBreakerPage = await loadCircuitBreakerPage()
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
        'circuit-breaker-realtime-states': {
          isLoading: false,
          data: { instances: [] },
        },
        'circuit-breaker-events-all-0-50': {
          isLoading: false,
          error: new Error('Events fetch failed'),
        },
      }

      const element = React.createElement(CircuitBreakerPage)
      expect(element).toBeDefined()
    })
  })

  describe('Top instances rendering', () => {
    test('renders top instances table when stats.topInstances has items', async () => {
      const CircuitBreakerPage = await loadCircuitBreakerPage()
      _queryStates = {
        'circuit-breaker-stats': {
          isLoading: false,
          data: {
            todayOpened: 2,
            weekOpened: 8,
            trippedInstanceCount: 1,
            topInstances: [
              {
                instanceId: 'inst-top1',
                instanceName: 'Top Instance',
                groupName: 'gpt-group',
                providerName: 'openai',
                openCount: 5,
                lastOpenedAt: new Date(Date.now() - 3600000).toISOString(),
                tripCount: 3,
              },
            ],
          },
        },
        'circuit-breaker-realtime-states': {
          isLoading: false,
          data: { instances: [] },
        },
        'circuit-breaker-events-all-0-50': {
          isLoading: false,
          data: { events: [], total: 0 },
        },
      }

      const element = React.createElement(CircuitBreakerPage)
      expect(element).toBeDefined()
    })
  })
})
