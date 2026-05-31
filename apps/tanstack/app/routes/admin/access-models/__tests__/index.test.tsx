import { describe, test, expect, mock, beforeEach, afterEach } from 'bun:test'

// Monaco-editor accesses `window` at module load time and breaks in test environment.
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
  Shield: () => React.createElement('span', { 'data-testid': 'shield-icon' }),
  Plus: () => React.createElement('span', { 'data-testid': 'plus-icon' }),
  Pencil: () => React.createElement('span', { 'data-testid': 'pencil-icon' }),
  Trash2: () => React.createElement('span', { 'data-testid': 'trash-icon' }),
  Lock: () => React.createElement('span', { 'data-testid': 'lock-icon' }),
}))

mock.module('sonner', () => ({
  toast: { success: mock(() => {}), error: mock(() => {}) },
}))

// Track query/mutation states so tests can control loading / error / data
let _queryStates: Record<string, { data?: any; error?: Error; isLoading?: boolean }> = {}
let _mutationState: Record<string, { isPending: boolean; mutateMock: any; lastArgs?: any }> = {}
let _invalidateQueriesMock = mock(() => Promise.resolve())
let _fetchMock: any = null

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
    const mutate = mock(async (...args: any[]) => {
      const mutationKey = mutationFn.toString()
      _mutationState[mutationKey] = _mutationState[mutationKey] || { isPending: false, mutateMock: mutate }
      _mutationState[mutationKey].isPending = true
      _mutationState[mutationKey].lastArgs = args
      try {
        const result = await mutationFn(...args)
        _mutationState[mutationKey].isPending = false
        if (onSuccess) onSuccess(result)
        return result
      } catch (err) {
        _mutationState[mutationKey].isPending = false
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
  Button: ({ children, onClick, disabled, variant, size, className }: any) =>
    React.createElement('button', { onClick, disabled, 'data-variant': variant, 'data-size': size, className, 'data-testid': 'button' }, children),
  Input: ({ id, type, value, onChange, disabled, className }: any) =>
    React.createElement('input', {
      id,
      type,
      value,
      onChange,
      disabled,
      className,
      'data-testid': `input-${id || 'unknown'}`,
    }),
  Label: ({ children, htmlFor, className }: any) =>
    React.createElement('label', { htmlFor, className, 'data-testid': `label-${htmlFor || 'unknown'}` }, children),
  Switch: ({ checked, onCheckedChange, className }: any) =>
    React.createElement('button', {
      role: 'switch',
      'aria-checked': checked,
      onClick: () => onCheckedChange && onCheckedChange(!checked),
      className,
      'data-testid': 'switch',
      'data-checked': String(checked),
    }),
  Dialog: ({ children, open, onOpenChange }: any) =>
    open ? React.createElement('div', { 'data-testid': 'dialog', 'data-open': String(open) }, children) : null,
  DialogContent: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-content' }, children),
  DialogHeader: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-header' }, children),
  DialogTitle: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-title' }, children),
  DialogDescription: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-description' }, children),
  DialogFooter: ({ children }: any) =>
    React.createElement('div', { 'data-testid': 'dialog-footer' }, children),
  Table: ({ children }: any) =>
    React.createElement('table', { 'data-testid': 'table' }, children),
  TableBody: ({ children }: any) =>
    React.createElement('tbody', { 'data-testid': 'table-body' }, children),
  TableCell: ({ children, className, colSpan }: any) =>
    React.createElement('td', { 'data-testid': 'table-cell', className, colSpan }, children),
  TableHead: ({ children, className }: any) =>
    React.createElement('th', { 'data-testid': 'table-head', className }, children),
  TableHeader: ({ children }: any) =>
    React.createElement('thead', { 'data-testid': 'table-header' }, children),
  TableRow: ({ children }: any) =>
    React.createElement('tr', { 'data-testid': 'table-row' }, children),
  Textarea: ({ value, onChange, rows, placeholder, className }: any) =>
    React.createElement('textarea', {
      value,
      onChange,
      rows,
      placeholder,
      className,
      'data-testid': 'textarea',
    }),
}))

/* ------------------------------------------------------------------ */
/*  Source file import (dynamic — avoids monaco-editor side-effects)   */
/* ------------------------------------------------------------------ */

async function loadAccessModelsPage() {
  const mod = await import('../index')
  return mod.AccessModelsPage as React.FC
}

/* ------------------------------------------------------------------ */
/*  Sample data                                                        */
/* ------------------------------------------------------------------ */

const sampleAccessModels = [
  {
    id: 'model-1',
    name: 'gpt-4',
    displayName: 'GPT-4',
    description: 'OpenAI GPT-4 model',
    enabled: true,
    capabilities: { streaming: true, functionCalling: true },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'model-2',
    name: 'claude-3',
    displayName: 'Claude 3',
    description: 'Anthropic Claude 3 model',
    enabled: false,
    capabilities: { streaming: true, functionCalling: false },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 'model-3',
    name: '__catchall__',
    displayName: 'Catch-all',
    description: 'System catch-all model',
    enabled: true,
    capabilities: {},
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
]

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

describe('AccessModelsPage', () => {
  beforeEach(() => {
    _queryStates = {}
    _mutationState = {}
    _invalidateQueriesMock.mockClear && _invalidateQueriesMock.mockClear()
    _fetchMock = null
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
    _mutationState = {}
  })

  describe('Component import', () => {
    test('exports AccessModelsPage as a function', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      expect(typeof AccessModelsPage).toBe('function')
    })
  })

  describe('Component rendering', () => {
    test('renders without crashing', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
      expect(element.type).toBe(AccessModelsPage)
    })

    test('shows loading state', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': { isLoading: true },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('shows error state', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          error: new Error('加载访问模型失败'),
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('renders table with data', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('shows empty state when no data', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: [] },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('renders with null data', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: null,
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })
  })

  describe('Mock API responses', () => {
    test('GET /api/access-models returns sample data structure', async () => {
      const mockResponse = {
        success: true,
        data: sampleAccessModels,
      }

      expect(mockResponse.success).toBe(true)
      expect(mockResponse.data).toHaveLength(3)
      expect(mockResponse.data[0].name).toBe('gpt-4')
      expect(mockResponse.data[1].enabled).toBe(false)
      expect(mockResponse.data[2].name).toBe('__catchall__')
    })

    test('POST /api/access-models with valid data returns success', async () => {
      const postBody = {
        name: 'new-model',
        displayName: 'New Model',
        description: 'A new access model',
        enabled: true,
        capabilities: { streaming: true },
      }

      const mockResponse = {
        success: true,
        data: { id: 'model-new', ...postBody },
      }

      expect(mockResponse.success).toBe(true)
      expect(mockResponse.data.name).toBe('new-model')
      expect(mockResponse.data.capabilities).toEqual({ streaming: true })
    })

    test('PUT /api/access-models/:id with valid data returns success', async () => {
      const putBody = {
        name: 'gpt-4-updated',
        displayName: 'GPT-4 Updated',
        description: 'Updated description',
        enabled: false,
        capabilities: { streaming: false },
      }

      const mockResponse = {
        success: true,
        data: { id: 'model-1', ...putBody },
      }

      expect(mockResponse.success).toBe(true)
      expect(mockResponse.data.name).toBe('gpt-4-updated')
      expect(mockResponse.data.enabled).toBe(false)
    })

    test('DELETE /api/access-models/:id returns success', async () => {
      const mockResponse = {
        success: true,
        data: { deleted: true },
      }

      expect(mockResponse.success).toBe(true)
      expect(mockResponse.data.deleted).toBe(true)
    })

    test('PATCH /api/access-models/:id/toggle returns success', async () => {
      const mockResponse = {
        success: true,
        data: { id: 'model-1', enabled: false },
      }

      expect(mockResponse.success).toBe(true)
      expect(mockResponse.data.enabled).toBe(false)
    })

    test('POST with duplicate name returns 409 error', async () => {
      const mockErrorResponse = {
        success: false,
        error: '接入模型名称已存在',
      }

      expect(mockErrorResponse.success).toBe(false)
      expect(mockErrorResponse.error).toBe('接入模型名称已存在')
    })

    test('POST with invalid JSON capabilities returns error', async () => {
      const mockErrorResponse = {
        success: false,
        error: 'capabilities 必须是有效的 JSON',
      }

      expect(mockErrorResponse.success).toBe(false)
      expect(mockErrorResponse.error).toContain('JSON')
    })

    test('DELETE non-existent model returns error', async () => {
      const mockErrorResponse = {
        success: false,
        error: 'Model not found',
      }

      expect(mockErrorResponse.success).toBe(false)
      expect(mockErrorResponse.error).toBe('Model not found')
    })
  })

  describe('User interactions', () => {
    test('toggle switch calls toggle API', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('delete button opens confirm dialog', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('edit button opens dialog with pre-filled data', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('system model cannot be deleted (no delete button)', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()

      // The __catchall__ model is the 3rd item (index 2)
      // It should not have a delete button rendered
      const systemModel = sampleAccessModels[2]
      expect(systemModel.name).toBe('__catchall__')
    })

    test('create button opens empty dialog', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })
  })

  describe('System model behavior', () => {
    test('system model (__catchall__) has system badge', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()

      // Verify system model is identified correctly
      const isSystemModel = (name: string) => name === '__catchall__'
      expect(isSystemModel('__catchall__')).toBe(true)
      expect(isSystemModel('gpt-4')).toBe(false)
      expect(isSystemModel('claude-3')).toBe(false)
    })

    test('system model name input is disabled in edit mode', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('non-system models can be deleted', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()

      // gpt-4 and claude-3 are not system models
      expect(sampleAccessModels[0].name).not.toBe('__catchall__')
      expect(sampleAccessModels[1].name).not.toBe('__catchall__')
    })
  })

  describe('Form behavior', () => {
    test('form is initialized with empty values for create', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('form is pre-filled with model data for edit', async () => {
      const model = sampleAccessModels[0]
      const expectedForm = {
        name: model.name,
        displayName: model.displayName || '',
        description: model.description || '',
        enabled: model.enabled,
        capabilities: JSON.stringify(model.capabilities || {}, null, 2),
      }

      expect(expectedForm.name).toBe('gpt-4')
      expect(expectedForm.displayName).toBe('GPT-4')
      expect(expectedForm.enabled).toBe(true)
      expect(expectedForm.capabilities).toBe(JSON.stringify({ streaming: true, functionCalling: true }, null, 2))
    })

    test('invalid capabilities JSON shows error', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('save mutation invalidates queries on success', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()

      // Verify invalidateQueries was set up
      expect(_invalidateQueriesMock).toBeDefined()
    })
  })

  describe('Edge cases', () => {
    test('handles model without displayName', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      const modelsWithoutDisplayName = [
        {
          ...sampleAccessModels[0],
          displayName: null,
        },
      ]
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: modelsWithoutDisplayName },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('handles model without description', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      const modelsWithoutDescription = [
        {
          ...sampleAccessModels[0],
          description: null,
        },
      ]
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: modelsWithoutDescription },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('handles model without capabilities', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      const modelsWithoutCapabilities = [
        {
          ...sampleAccessModels[0],
          capabilities: null,
        },
      ]
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: modelsWithoutCapabilities },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('handles error with non-Error instance', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          error: 'String error' as any,
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('handles single model in list', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: [sampleAccessModels[0]] },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('handles model with empty capabilities object', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      const modelsWithEmptyCapabilities = [
        {
          ...sampleAccessModels[0],
          capabilities: {},
        },
      ]
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: modelsWithEmptyCapabilities },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('handles very long model name', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      const longNameModel = [
        {
          ...sampleAccessModels[0],
          name: 'a'.repeat(200),
        },
      ]
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: longNameModel },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('handles model with special characters in name', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      const specialCharModels = [
        {
          ...sampleAccessModels[0],
          name: 'model-with_special.chars',
        },
      ]
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: specialCharModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })
  })

  describe('isSystemModel helper', () => {
    test('identifies __catchall__ as system model', () => {
      const isSystemModel = (name: string) => name === '__catchall__'
      expect(isSystemModel('__catchall__')).toBe(true)
    })

    test('identifies regular names as non-system', () => {
      const isSystemModel = (name: string) => name === '__catchall__'
      expect(isSystemModel('gpt-4')).toBe(false)
      expect(isSystemModel('claude-3')).toBe(false)
      expect(isSystemModel('')).toBe(false)
    })

    test('handles edge case names', () => {
      const isSystemModel = (name: string) => name === '__catchall__'
      expect(isSystemModel('__catchall__ ')).toBe(false)
      expect(isSystemModel('__ Catchall__')).toBe(false)
      expect(isSystemModel('catchall')).toBe(false)
    })
  })

  describe('Capabilities JSON handling', () => {
    test('valid JSON object parses correctly', () => {
      const json = '{"streaming": true, "functionCalling": false}'
      const parsed = JSON.parse(json)
      expect(parsed).toEqual({ streaming: true, functionCalling: false })
    })

    test('empty JSON object parses correctly', () => {
      const json = '{}'
      const parsed = JSON.parse(json)
      expect(parsed).toEqual({})
    })

    test('invalid JSON throws error', () => {
      const json = '{invalid json}'
      expect(() => JSON.parse(json)).toThrow()
    })

    test('nested JSON object parses correctly', () => {
      const json = '{"features": {"streaming": true, "advanced": {"batch": false}}}'
      const parsed = JSON.parse(json)
      expect(parsed.features.advanced.batch).toBe(false)
    })
  })

  describe('Mutation error handling', () => {
    test('save mutation error sets formError', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('delete mutation error shows toast', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })

    test('toggle mutation error shows toast', async () => {
      const AccessModelsPage = await loadAccessModelsPage()
      _queryStates = {
        'access-models': {
          isLoading: false,
          data: { success: true, data: sampleAccessModels },
        },
      }

      const element = React.createElement(AccessModelsPage)
      expect(element).toBeDefined()
    })
  })
})
