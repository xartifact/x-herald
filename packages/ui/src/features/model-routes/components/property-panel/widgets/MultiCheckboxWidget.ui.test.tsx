import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import type { WidgetProps } from '@rjsf/utils'

import { MultiCheckboxWidget } from './MultiCheckboxWidget'

function buildProps(overrides: Partial<WidgetProps> = {}): WidgetProps {
  const props = {
    id: 'capabilityConfig.capabilities',
    label: '能力列表',
    schema: {
      type: 'array',
      items: { type: 'string', enum: ['vision', 'audio', 'tts'] },
    },
    uiSchema: {},
    value: [] as string[],
    onChange: vi.fn(),
    onBlur: vi.fn(),
    onFocus: vi.fn(),
    options: {
      enumOptions: [
        { value: 'vision', label: '视觉 (vision)' },
        { value: 'audio', label: '音频 (audio)' },
        { value: 'tts', label: '语音合成 (tts)' },
      ],
    },
    formContext: {},
    disabled: false,
    readonly: false,
    required: false,
    autofocus: false,
    hideError: false,
    name: 'capabilities',
    registry: {} as WidgetProps['registry'],
  } as unknown as WidgetProps
  return { ...props, ...overrides }
}

function renderWidget(overrides: Partial<WidgetProps> = {}) {
  return render(<MultiCheckboxWidget {...buildProps(overrides)} />)
}

describe('MultiCheckboxWidget', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders one checkbox per enum option with label', () => {
    renderWidget()
    expect(screen.getByText('视觉 (vision)')).toBeDefined()
    expect(screen.getByText('音频 (audio)')).toBeDefined()
    expect(screen.getByText('语音合成 (tts)')).toBeDefined()
  })

  it('checks only options present in value', () => {
    renderWidget({ value: ['vision', 'tts'] })
    expect(screen.getByLabelText('视觉 (vision)').getAttribute('aria-checked')).toBe('true')
    expect(screen.getByLabelText('音频 (audio)').getAttribute('aria-checked')).toBe('false')
    expect(screen.getByLabelText('语音合成 (tts)').getAttribute('aria-checked')).toBe('true')
  })

  it('appends value when an unchecked option is toggled on', () => {
    const onChange = vi.fn()
    renderWidget({ onChange, value: ['vision'] })
    fireEvent.click(screen.getByLabelText('音频 (audio)'))
    expect(onChange).toHaveBeenCalledWith(['vision', 'audio'])
  })

  it('removes value when a checked option is toggled off', () => {
    const onChange = vi.fn()
    renderWidget({ onChange, value: ['vision', 'audio'] })
    fireEvent.click(screen.getByLabelText('视觉 (vision)'))
    expect(onChange).toHaveBeenCalledWith(['audio'])
  })

  it('renders raw value as label when option has no label', () => {
    renderWidget({
      options: { enumOptions: [{ value: 'vision' }] },
    })
    expect(screen.getByText('vision')).toBeDefined()
  })

  it('does not crash on undefined value', () => {
    renderWidget({ value: undefined as unknown as string[] })
    expect(screen.getByText('视觉 (vision)')).toBeDefined()
  })
  it('disables checkboxes when disabled', () => {
    renderWidget({ disabled: true })
    expect(screen.getByLabelText('视觉 (vision)').getAttribute('data-disabled')).not.toBeNull()
  })

  it('disables checkboxes when readonly', () => {
    renderWidget({ readonly: true })
    expect(screen.getByLabelText('视觉 (vision)').getAttribute('data-disabled')).not.toBeNull()
  })
})
