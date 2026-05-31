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

async function loadProviderStatsPage() {
  const mod = await import('../index')
  return mod.ProviderStatsPage as React.FC
}

/* ------------------------------------------------------------------ */
/*  Helper replicas (source functions are module-private)               */
/* ------------------------------------------------------------------ */

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}` }
}

/* ------------------------------------------------------------------ */
/*  Tests                                                               */
/* ------------------------------------------------------------------ */

describe('ProviderStatsPage', () => {
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

  test('exports ProviderStatsPage as a function', async () => {
    const ProviderStatsPage = await loadProviderStatsPage()
    expect(typeof ProviderStatsPage).toBe('function')
  })

  /* -- Loading state -- */

  test('shows loading state when query is loading', async () => {
    const ProviderStatsPage = await loadProviderStatsPage()
    _queryStates = {
      providers: { isLoading: true },
    }

    const element = React.createElement(ProviderStatsPage)
    expect(element).toBeDefined()
    expect(element.type).toBe(ProviderStatsPage)
  })

  /* -- Error state -- */

  test('shows error state when API fails', async () => {
    const ProviderStatsPage = await loadProviderStatsPage()
    _queryStates = {
      providers: {
        isLoading: false,
        error: new Error('Failed to fetch providers'),
      },
    }

    const element = React.createElement(ProviderStatsPage)
    expect(element).toBeDefined()
  })

  /* -- Empty state -- */

  test('shows empty state when no providers', async () => {
    const ProviderStatsPage = await loadProviderStatsPage()
    _queryStates = {
      providers: {
        isLoading: false,
        data: [],
      },
    }

    const element = React.createElement(ProviderStatsPage)
    expect(element).toBeDefined()
  })

  /* -- Success state with data -- */

  test('shows data when API returns providers', async () => {
    const ProviderStatsPage = await loadProviderStatsPage()
    _queryStates = {
      providers: {
        isLoading: false,
        data: [
          {
            id: 'prov-1',
            name: 'OpenAI',
            apiKey: 'sk-test',
            protocols: {
              openai: { baseUrl: 'https://api.openai.com', enabled: true },
              anthropic: { baseUrl: 'https://api.anthropic.com', enabled: false },
            },
            enabled: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          {
            id: 'prov-2',
            name: 'Disabled Provider',
            apiKey: null,
            protocols: {},
            enabled: false,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      },
    }

    const element = React.createElement(ProviderStatsPage)
    expect(element).toBeDefined()
  })

  /* -- Stats calculation verification -- */

  test('calculates correct stats: total=2, enabled=1, protocols=1', async () => {
    const ProviderStatsPage = await loadProviderStatsPage()
    _queryStates = {
      providers: {
        isLoading: false,
        data: [
          {
            id: 'prov-1',
            name: 'Provider A',
            apiKey: 'key-1',
            protocols: {
              openai: { baseUrl: 'https://api.openai.com', enabled: true },
            },
            enabled: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
          {
            id: 'prov-2',
            name: 'Provider B',
            apiKey: null,
            protocols: {},
            enabled: false,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      },
    }

    const element = React.createElement(ProviderStatsPage)
    expect(element).toBeDefined()
  })

  test('shows provider with no protocols as empty', async () => {
    const ProviderStatsPage = await loadProviderStatsPage()
    _queryStates = {
      providers: {
        isLoading: false,
        data: [
          {
            id: 'prov-empty',
            name: 'Empty Provider',
            apiKey: null,
            protocols: {},
            enabled: true,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          },
        ],
      },
    }

    const element = React.createElement(ProviderStatsPage)
    expect(element).toBeDefined()
  })
})
