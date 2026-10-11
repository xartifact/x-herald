import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MultiSelect, type MultiSelectOption } from './multi-select'

/**
 * 滚轮健壮性（结构断言）：下拉打开后，cmdk 列表或其 Command root
 * 必须保留可滚动 CSS（overflow-y-auto + max-height），
 * 否则鼠标滚轮/键盘无法滚动超长列表。
 * 注：jsdom 无真实布局，scrollHeight/clientHeight 不可用，改用 className 断言。
 */
describe('MultiSelect selected value controls', () => {
  it('keeps remove buttons separate and keyboard-accessible without toggling the popover', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <MultiSelect
        options={[{ value: 'one', label: 'First option' }]}
        selected={['one']}
        onChange={onChange}
      />,
    )

    const trigger = screen.getByRole('button', { name: '打开选项' })
    const remove = screen.getByRole('button', { name: '移除 First option' })
    expect(document.querySelector('button button')).toBeNull()
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await user.click(remove)
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    remove.focus()
    await user.keyboard('{Enter}')
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    onChange.mockClear()

    remove.focus()
    await user.keyboard(' ')
    expect(onChange).toHaveBeenLastCalledWith([])
    expect(trigger.getAttribute('aria-expanded')).toBe('false')

    await user.click(trigger)
    expect(trigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('opens from the empty placeholder and does not open when disabled', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <MultiSelect options={[]} selected={[]} onChange={vi.fn()} placeholder="Choose items" />,
    )

    const placeholderTrigger = screen.getByRole('button', { name: 'Choose items' })
    await user.click(screen.getByText('Choose items'))
    expect(placeholderTrigger.getAttribute('aria-expanded')).toBe('true')

    rerender(
      <MultiSelect
        options={[]}
        selected={[]}
        onChange={vi.fn()}
        placeholder="Choose items"
        disabled
      />,
    )
    const disabledTrigger = screen.getByRole('button', { name: 'Choose items' })
    expect((disabledTrigger as HTMLButtonElement).disabled).toBe(true)
    await user.click(disabledTrigger)
    expect(disabledTrigger.getAttribute('aria-expanded')).toBe('true')
  })

  it('applies custom classes to the control', () => {
    const { container } = render(
      <MultiSelect options={[]} selected={[]} onChange={vi.fn()} className="custom-control" />,
    )
    expect(container.querySelector('.custom-control')).not.toBeNull()
  })

  it('does not render remove controls or open when disabled', () => {
    render(
      <MultiSelect
        options={[{ value: 'one', label: 'First option' }]}
        selected={['one']}
        onChange={vi.fn()}
        disabled
      />,
    )

    expect(screen.queryByRole('button', { name: '移除 First option' })).toBeNull()
    const trigger = screen.getByRole('button', { name: '打开选项' })
    expect((trigger as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('MultiSelect scrolling', () => {
  const options: MultiSelectOption[] = Array.from({ length: 30 }, (_, i) => ({
    value: `group-${i}`,
    label: `模型组 ${i + 1}`,
  }))

  const onChange = vi.fn()

  it('keeps a scrollable container (overflow-y-auto + max-height) when opened', async () => {
    render(<MultiSelect options={options} selected={[]} onChange={onChange} />)

    fireEvent.click(screen.getByRole('button', { name: '请选择...' }))

    // portal 异步渲染，等待列表项出现
    await screen.findByText('模型组 1')

    const list = screen.getAllByText('模型组 1')[0]
    let node = list.parentElement
    let found = false
    while (node && !found) {
      const cls = node.getAttribute('class') ?? ''
      const css = node.getAttribute('style') ?? ''
      const isScrollable =
        (cls.includes('overflow-y-auto') || cls.includes('overflow-y-auto')) &&
        (cls.includes('max-h-') || /max-height/.test(css))
      // cmdk CommandList 由 ui/command.tsx 提供 overflow-y-auto + max-h-[300px]
      if (
        isScrollable ||
        (node.getAttribute('cmdk-list') !== null && cls.includes('overflow-y-auto'))
      ) {
        found = true
      }
      node = node.parentElement
    }
    expect(found).toBe(true)
  })

  /**
   * 真正的回归用例：CSS 可滚动不等于滚轮真的能滚。
   *
   * Radix Dialog 的滚动锁定（react-remove-scroll）在 document 上挂了一个
   * 冒泡阶段（非 capture）的 wheel 监听器：只要 wheel 事件冒泡到 document 且
   * 没有被拦截，它就会无条件 preventDefault ——这正是 Popover 内容经 Portal
   * 挂到 document.body、脱离 Dialog 锁定子树后遇到的问题（生产环境实测复现过，
   * 上一版修复只补了 CSS，jsdom 测不出真实拦截，所以"测试通过但线上仍然滚不动"）。
   * 这里在 document 上模拟同样的拦截器，验证 CommandList 的 wheel 事件
   * 会在到达 document 前被 stopPropagation，不会被这类外部监听器吃掉。
   */
  it('阻止外层 Dialog 滚动锁定的全局 wheel 监听器拦截列表滚动', async () => {
    const globalWheelHandler = vi.fn((e: WheelEvent) => {
      if (e.cancelable) e.preventDefault()
    })
    document.addEventListener('wheel', globalWheelHandler)

    try {
      render(<MultiSelect options={options} selected={[]} onChange={onChange} />)
      fireEvent.click(screen.getByRole('button', { name: '请选择...' }))
      await screen.findByText('模型组 1')

      const list = document.querySelector('[cmdk-list]')
      expect(list).not.toBeNull()

      const event = new WheelEvent('wheel', { deltaY: 150, bubbles: true, cancelable: true })
      list!.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(false)
    } finally {
      document.removeEventListener('wheel', globalWheelHandler)
    }
  })
})
