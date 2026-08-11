import { describe, it, expect, beforeEach } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'

import { CategoryListField } from './CategoryListField'

import type { FieldProps } from '@rjsf/utils'

function renderField(props: Partial<FieldProps> & { formData?: string[] }) {
  const onChange = props.onChange ?? (() => {})
  const defaultProps: FieldProps = {
    id: 'test-field',
    title: '分类列表',
    schema: {
      type: 'array',
      title: '分类列表',
      description: '每个分类生成一个 handle',
      items: { type: 'string' },
    } as FieldProps['schema'],
    formData: props.formData ?? [],
    onChange: onChange as FieldProps['onChange'],
    fieldPathId: { path: 'intentConfig.categories' } as FieldProps['fieldPathId'],
    formContext: {},
    uiSchema: {},
    name: '',
    disabled: false,
    readonly: false,
    required: false,
  }
  return render(<CategoryListField {...defaultProps} {...(props as FieldProps)} />)
}

describe('CategoryListField', () => {
  beforeEach(() => {
    cleanup()
  })

  it('renders title and description from schema', () => {
    renderField({})
    expect(screen.getByText('分类列表')).toBeDefined()
    expect(screen.getByText('每个分类生成一个 handle')).toBeDefined()
  })

  it('shows empty-state placeholder when no items', () => {
    renderField({ formData: [] })
    expect(screen.getByText('点击下方添加第一个分类')).toBeDefined()
    expect(screen.getByPlaceholderText('新增分类')).toBeDefined()
    expect(screen.getByRole('button', { name: '添加' })).toBeDefined()
  })

  it('renders one chip per existing category', () => {
    renderField({ formData: ['greeting', 'billing'] })
    expect(screen.getByText('greeting')).toBeDefined()
    expect(screen.getByText('billing')).toBeDefined()
    expect(screen.queryByText('点击下方添加第一个分类')).toBeNull()
  })

  it('adds a category when input + 添加 button clicked', () => {
    let captured: unknown = null
    const onChange = (next: unknown) => {
      captured = next
    }
    renderField({ formData: [], onChange: onChange as FieldProps['onChange'] })
    fireEvent.input(screen.getByPlaceholderText('新增分类'), {
      target: { value: 'greeting' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(captured).toEqual(['greeting'])
  })

  it('adds a category when Enter key pressed', () => {
    let captured: unknown = null
    const onChange = (next: unknown) => {
      captured = next
    }
    renderField({ formData: [], onChange: onChange as FieldProps['onChange'] })
    const input = screen.getByPlaceholderText('新增分类')
    fireEvent.input(input, { target: { value: 'billing' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(captured).toEqual(['billing'])
  })

  it('rejects empty / whitespace-only input', () => {
    let callCount = 0
    const onChange = () => {
      callCount++
    }
    renderField({ formData: [], onChange: onChange as FieldProps['onChange'] })
    fireEvent.input(screen.getByPlaceholderText('新增分类'), {
      target: { value: '   ' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(callCount).toBe(0)
  })

  it('rejects duplicate category (no double-add)', () => {
    let callCount = 0
    const onChange = () => {
      callCount++
    }
    renderField({ formData: ['greeting'], onChange: onChange as FieldProps['onChange'] })
    fireEvent.input(screen.getByPlaceholderText('新增分类'), {
      target: { value: 'greeting' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(callCount).toBe(0)
  })

  it('removes a category when X button clicked', () => {
    let captured: unknown = null
    const onChange = (next: unknown) => {
      captured = next
    }
    renderField({
      formData: ['greeting', 'billing', 'support'],
      onChange: onChange as FieldProps['onChange'],
    })
    const removeButtons = screen
      .getAllByRole('button')
      .filter((b) => b.querySelector('svg.lucide-x'))
    expect(removeButtons.length).toBe(3)
    fireEvent.click(removeButtons[1]!)
    expect(captured).toEqual(['greeting', 'support'])
  })

  it('clears input after successful add', () => {
    renderField({ formData: [] })
    const input = screen.getByPlaceholderText('新增分类') as HTMLInputElement
    fireEvent.input(input, { target: { value: 'greeting' } })
    expect(input.value).toBe('greeting')
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(input.value).toBe('')
  })

  it('preserves existing items when adding a new one', () => {
    let captured: unknown = null
    const onChange = (next: unknown) => {
      captured = next
    }
    renderField({
      formData: ['greeting'],
      onChange: onChange as FieldProps['onChange'],
    })
    fireEvent.input(screen.getByPlaceholderText('新增分类'), {
      target: { value: 'billing' },
    })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    expect(captured).toEqual(['greeting', 'billing'])
  })
})
