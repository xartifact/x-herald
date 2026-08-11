import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

import type { WidgetProps } from '@rjsf/utils'

import { RemoteSelectWidget } from './RemoteSelectWidget'
import type { RemoteSelectOptions } from '../remote-sources'

const useRemoteOptionsMock = vi.hoisted(() => {
  const fn = vi.fn()
  fn.mockImplementation((opts: RemoteSelectOptions) => {
    if (opts.enumOptions) {
      return { options: opts.enumOptions, loading: false }
    }
    if (opts.remoteSource === 'providers') {
      return {
        options: [
          { value: 'p1', label: 'OpenAI' },
          { value: 'p2', label: 'Anthropic' },
        ],
        loading: false,
      }
    }
    if (opts.remoteSource === 'model-instances') {
      return {
        options: [
          { value: 'i1', label: 'gpt-4 (gpt-4-turbo)' },
          { value: 'i2', label: 'claude-3 (claude-3-opus)' },
        ],
        loading: false,
      }
    }
    if (opts.remoteSource === 'model-groups') {
      return {
        options: [
          { value: 'g1', label: 'GPT-4 Group' },
          { value: 'g2', label: 'Claude Group' },
        ],
        loading: false,
      }
    }
    return { options: [], loading: false }
  })
  return fn
})

vi.mock('../remote-sources', async () => {
  const actual = await vi.importActual<typeof import('../remote-sources')>('../remote-sources')
  return {
    ...actual,
    useRemoteOptions: useRemoteOptionsMock,
  }
})

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } })
}

function buildProps(overrides: Partial<WidgetProps> = {}): WidgetProps {
  const props = {
    id: 'test-field',
    label: '测试字段',
    schema: { type: 'string' } as WidgetProps['schema'],
    uiSchema: {},
    required: false,
    disabled: false,
    readonly: false,
    name: '',
    onChange: () => {},
    onBlur: () => {},
    onFocus: () => {},
    formContext: {},
    fieldPathId: { path: 'test' } as WidgetProps['fieldPathId'],
    options: {},
    ...overrides,
  } as WidgetProps
  if (overrides.formData !== undefined && overrides.value === undefined) {
    ;(props as { value: unknown }).value = overrides.formData
  }
  return props
}

function renderWidget(overrides: Partial<WidgetProps> = {}) {
  const finalProps = buildProps(overrides)
  const client = makeClient()
  return render(
    <QueryClientProvider client={client}>
      <RemoteSelectWidget {...finalProps} />
    </QueryClientProvider>,
  )
}

describe('RemoteSelectWidget', () => {
  beforeEach(() => {
    cleanup()
    vi.clearAllMocks()
  })

  it('renders label from props', () => {
    renderWidget()
    expect(screen.getByText('测试字段')).toBeDefined()
  })

  it('renders default placeholder when no placeholder provided', () => {
    renderWidget()
    const trigger = screen.getByRole('combobox')
    expect(trigger.textContent).toContain('请选择...')
  })

  it('renders custom placeholder from ui:options', () => {
    renderWidget({ options: { placeholder: '选择供应商' } })
    const trigger = screen.getByRole('combobox')
    expect(trigger.textContent).toContain('选择供应商')
  })

  it('passes value to Select component', () => {
    renderWidget({
      formData: 'b',
      options: {
        enumOptions: [
          { value: 'a', label: 'Option A' },
          { value: 'b', label: 'Option B' },
        ],
      },
    })
    const trigger = screen.getByRole('combobox')
    expect(trigger.getAttribute('data-state')).toBe('closed')
  })

  it('renders required indicator when required is true', () => {
    renderWidget({ required: true })
    expect(screen.getByText('*')).toBeDefined()
  })

  it('shows clear button when value is set and allowClear is true', () => {
    const { container } = renderWidget({
      formData: 'a',
      options: { enumOptions: [{ value: 'a', label: 'A' }] },
    })
    const clearBtn = container.querySelector('button[aria-label="清除选择"]')
    expect(clearBtn).toBeDefined()
  })

  it('does not show clear button when value is empty', () => {
    const { container } = renderWidget({
      options: { enumOptions: [{ value: 'a', label: 'A' }] },
    })
    const clearBtn = container.querySelector('button[aria-label="清除选择"]')
    expect(clearBtn).toBeNull()
  })

  it('does not show clear button when allowClear is false', () => {
    const { container } = renderWidget({
      formData: 'a',
      options: {
        enumOptions: [{ value: 'a', label: 'A' }],
        allowClear: false,
      },
    })
    const clearBtn = container.querySelector('button[aria-label="清除选择"]')
    expect(clearBtn).toBeNull()
  })

  it('does not show clear button when readonly', () => {
    const { container } = renderWidget({
      formData: 'a',
      readonly: true,
      options: { enumOptions: [{ value: 'a', label: 'A' }] },
    })
    const clearBtn = container.querySelector('button[aria-label="清除选择"]')
    expect(clearBtn).toBeNull()
  })

  it('does not show clear button when disabled', () => {
    const { container } = renderWidget({
      formData: 'a',
      disabled: true,
      options: { enumOptions: [{ value: 'a', label: 'A' }] },
    })
    const clearBtn = container.querySelector('button[aria-label="清除选择"]')
    expect(clearBtn).toBeNull()
  })

  it('passes disabled prop to Select component', () => {
    renderWidget({
      disabled: true,
      options: { enumOptions: [{ value: 'a', label: 'A' }] },
    })
    const trigger = screen.getByRole('combobox')
    expect(trigger.getAttribute('data-disabled')).toBeDefined()
  })

  it('passes readonly to Select as disabled', () => {
    renderWidget({
      readonly: true,
      options: { enumOptions: [{ value: 'a', label: 'A' }] },
    })
    const trigger = screen.getByRole('combobox')
    expect(trigger.getAttribute('data-disabled')).toBeDefined()
  })

  it('clears value when clear button clicked', () => {
    let captured: unknown = 'initial'
    const { container } = renderWidget({
      formData: 'a',
      options: {
        enumOptions: [{ value: 'a', label: 'A' }],
        allowClear: true,
      },
      onChange: (v) => {
        captured = v
      },
    })
    const clearBtn = container.querySelector('button[aria-label="清除选择"]') as HTMLButtonElement
    expect(clearBtn).toBeDefined()
    fireEvent.click(clearBtn)
    expect(captured).toBeUndefined()
  })

  it('calls useRemoteOptions with options and formData', () => {
    renderWidget({
      formContext: { formData: { actionType: 'route_to_group' } },
      options: {
        dependsOn: 'actionType',
        remoteSourceMap: { route_to_group: 'model-groups' },
      },
    })
    expect(vi.mocked(useRemoteOptionsMock)).toHaveBeenCalled()
  })

  it('preserves stale value instead of auto-clearing when value not in options', async () => {
    let captured: unknown = 'stale-value'
    const onChange = (v: unknown) => {
      captured = v
    }
    renderWidget({
      formData: 'stale-value',
      onChange: onChange as WidgetProps['onChange'],
      options: {
        enumOptions: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    })
    await waitFor(() => {
      expect(captured).toBe('stale-value')
    })
  })

  it('shows stale warning indicator when value not in options', async () => {
    renderWidget({
      formData: 'stale-value',
      options: {
        enumOptions: [
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ],
      },
    })
    await waitFor(() => {
      const trigger = screen.getByRole('combobox')
      expect(trigger.className).toContain('warning')
    })
  })

  it('does not auto-clear when value still exists in new options', () => {
    let captured: unknown = 'a'
    renderWidget({
      formData: 'a',
      onChange: (v) => {
        captured = v
      },
      options: {
        enumOptions: [{ value: 'a', label: 'A' }],
      },
    })
    expect(captured).toBe('a')
  })
})
