import { describe, test, expect, mock } from 'bun:test'
import React from 'react'
import { renderToString } from 'react-dom/server'

const basePath = '/home/binzhan/Workspaces/github/xartifact/x-llm-gateway/packages/ui/src'

// Mock modules BEFORE importing the components under test
mock.module('@tanstack/react-query', () => ({
  useQuery: mock(() => ({
    data: undefined,
    isLoading: false,
    isError: false,
    error: null,
  })),
  useMutation: mock(() => ({
    mutate: mock(() => {}),
    mutateAsync: mock(() => Promise.resolve()),
    isPending: false,
    isError: false,
    error: null,
    data: undefined,
  })),
  useQueryClient: mock(() => ({
    invalidateQueries: mock(() => Promise.resolve()),
  })),
}))

mock.module('sonner', () => ({
  toast: {
    success: mock(() => {}),
    error: mock(() => {}),
  },
}))

mock.module(`${basePath}/hooks/use-settings.ts`, () => ({
  useUpdateSettings: mock(() => ({
    mutate: mock(() => {}),
    isPending: false,
  })),
}))

mock.module(`${basePath}/hooks/use-config-io.ts`, () => ({
  useExportConfig: mock(() => ({
    mutate: mock(() => {}),
    isPending: false,
  })),
  useImportConfig: mock(() => ({
    mutateAsync: mock(() => Promise.resolve({ summary: {}, errors: [] })),
    isPending: false,
  })),
}))

// Mock UI components
mock.module(`${basePath}/components/ui/button.tsx`, () => ({
  Button: ({ children, ...props }: any) => React.createElement('button', props, children),
}))

mock.module(`${basePath}/components/ui/card.tsx`, () => ({
  Card: ({ children, ...props }: any) => React.createElement('div', { ...props, 'data-testid': 'card' }, children),
  CardHeader: ({ children, ...props }: any) => React.createElement('div', props, children),
  CardContent: ({ children, ...props }: any) => React.createElement('div', props, children),
  CardTitle: ({ children, ...props }: any) => React.createElement('h3', props, children),
  CardDescription: ({ children, ...props }: any) => React.createElement('p', props, children),
}))

mock.module(`${basePath}/components/ui/select.tsx`, () => ({
  Select: ({ children, ...props }: any) => React.createElement('div', props, children),
  SelectContent: ({ children, ...props }: any) => React.createElement('div', props, children),
  SelectItem: ({ children, ...props }: any) => React.createElement('div', props, children),
  SelectTrigger: ({ children, ...props }: any) => React.createElement('div', props, children),
  SelectValue: ({ children, ...props }: any) => React.createElement('span', props, children),
}))

mock.module(`${basePath}/components/ui/input.tsx`, () => ({
  Input: (props: any) => React.createElement('input', props),
}))

mock.module(`${basePath}/components/ui/label.tsx`, () => ({
  Label: ({ children, ...props }: any) => React.createElement('label', props, children),
}))

mock.module(`${basePath}/components/ui/alert.tsx`, () => ({
  Alert: ({ children, ...props }: any) => React.createElement('div', { ...props, role: 'alert' }, children),
  AlertTitle: ({ children, ...props }: any) => React.createElement('h4', props, children),
  AlertDescription: ({ children, ...props }: any) => React.createElement('div', props, children),
}))

mock.module('lucide-react', () => ({
  Bot: () => React.createElement('span', { 'data-testid': 'bot-icon' }, 'Bot'),
  RefreshCw: () => React.createElement('span', { 'data-testid': 'refresh-icon' }, 'Refresh'),
  ShieldAlert: () => React.createElement('span', { 'data-testid': 'shield-icon' }, 'Shield'),
  Download: () => React.createElement('span', { 'data-testid': 'download-icon' }, 'Download'),
  Upload: () => React.createElement('span', { 'data-testid': 'upload-icon' }, 'Upload'),
  AlertTriangle: () => React.createElement('span', { 'data-testid': 'alert-icon' }, 'Alert'),
}))

// Now import components after mocks
import { AiModelSection } from '../ai-model-section'
import { CircuitBreakerSection } from '../circuit-breaker-section'
import { ConfigIOSection } from '../config-io-section'

const mockSettings = {
  aiModelGroupId: 'group-1',
  availableModelGroups: [
    {
      id: 'group-1',
      name: 'test-group',
      displayName: 'Test Group',
      instanceCount: 2,
    },
  ],
  circuitBreaker: {
    failureThreshold: 3,
    openDurationMs: 60000,
    maxBackoffMs: 300000,
    maxTripsBeforeCooldown: 5,
    cooldownDurationMs: 1800000,
  },
} as any

describe('AiModelSection', () => {
  test('renders loading state', () => {
    const html = renderToString(
      React.createElement(AiModelSection, { settings: undefined, isLoading: true })
    )
    expect(html).toContain('加载中')
  })

  test('renders with settings data', () => {
    const html = renderToString(
      React.createElement(AiModelSection, { settings: mockSettings, isLoading: false })
    )
    expect(html).toContain('AI 功能模型')
    expect(html).toContain('Test Group')
  })

  test('renders save button', () => {
    const html = renderToString(
      React.createElement(AiModelSection, { settings: mockSettings, isLoading: false })
    )
    expect(html).toContain('保存')
  })
})

describe('CircuitBreakerSection', () => {
  test('renders loading state', () => {
    const html = renderToString(
      React.createElement(CircuitBreakerSection, { settings: undefined, isLoading: true })
    )
    expect(html).toContain('加载中')
  })

  test('renders with circuit breaker settings', () => {
    const html = renderToString(
      React.createElement(CircuitBreakerSection, { settings: mockSettings, isLoading: false })
    )
    expect(html).toContain('熔断器配置')
    expect(html).toContain('失败阈值')
    expect(html).toContain('基础熔断时长')
  })

  test('renders all form fields', () => {
    const html = renderToString(
      React.createElement(CircuitBreakerSection, { settings: mockSettings, isLoading: false })
    )
    expect(html).toContain('cb-threshold')
    expect(html).toContain('cb-duration')
    expect(html).toContain('cb-max-backoff')
    expect(html).toContain('cb-cooldown-trips')
    expect(html).toContain('cb-cooldown-duration')
  })
})

describe('ConfigIOSection', () => {
  test('renders export and import buttons', () => {
    const html = renderToString(React.createElement(ConfigIOSection))
    expect(html).toContain('导出配置')
    expect(html).toContain('导入配置')
    expect(html).toContain('配置导入')
    expect(html).toContain('导出')
  })

  test('renders hidden file input', () => {
    const html = renderToString(React.createElement(ConfigIOSection))
    expect(html).toContain('type="file"')
    expect(html).toContain('accept=".json"')
  })
})
