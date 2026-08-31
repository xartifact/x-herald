import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MultiSelect, type MultiSelectOption } from './multi-select'

/**
 * 滚轮健壮性（结构断言）：下拉打开后，cmdk 列表或其 Command root
 * 必须保留可滚动 CSS（overflow-y-auto + max-height），
 * 否则鼠标滚轮/键盘无法滚动超长列表。
 * 注：jsdom 无真实布局，scrollHeight/clientHeight 不可用，改用 className 断言。
 */
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
})
