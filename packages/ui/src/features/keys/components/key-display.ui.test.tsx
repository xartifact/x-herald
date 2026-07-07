import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { KeyDisplay, KeyAlert } from './key-display'

describe('KeyDisplay', () => {
  const mockKey = 'sk-test1234567890abcdef'

  it('renders masked key when hidden', () => {
    render(
      <KeyDisplay
        keyValue={mockKey}
        showKey={false}
        copied={false}
        onToggleShow={() => {}}
        onCopy={() => {}}
      />,
    )

    expect(screen.getByText('sk-test1...cdef')).toBeInTheDocument()
  })

  it('renders full key when shown', () => {
    render(
      <KeyDisplay
        keyValue={mockKey}
        showKey={true}
        copied={false}
        onToggleShow={() => {}}
        onCopy={() => {}}
      />,
    )

    expect(screen.getByText(mockKey)).toBeInTheDocument()
  })

  it('calls onToggleShow when toggle button is clicked', async () => {
    const onToggleShow = vi.fn()
    const user = userEvent.setup()
    render(
      <KeyDisplay
        keyValue={mockKey}
        showKey={false}
        copied={false}
        onToggleShow={onToggleShow}
        onCopy={() => {}}
      />,
    )

    const buttons = screen.getAllByRole('button')
    await user.click(buttons[0])
    expect(onToggleShow).toHaveBeenCalledTimes(1)
  })

  it('calls onCopy when copy button is clicked', async () => {
    const onCopy = vi.fn()
    const user = userEvent.setup()
    render(
      <KeyDisplay
        keyValue={mockKey}
        showKey={false}
        copied={false}
        onToggleShow={() => {}}
        onCopy={onCopy}
      />,
    )

    const buttons = screen.getAllByRole('button')
    await user.click(buttons[1])
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('shows both buttons when copied is true', () => {
    render(
      <KeyDisplay
        keyValue={mockKey}
        showKey={false}
        copied={true}
        onToggleShow={() => {}}
        onCopy={() => {}}
      />,
    )

    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(2)
  })
})

describe('KeyAlert', () => {
  it('renders key value and warning message', () => {
    const onCopy = vi.fn()
    render(<KeyAlert keyValue="sk-new-key-123" copied={false} onCopy={onCopy} />)

    expect(screen.getByText('sk-new-key-123')).toBeInTheDocument()
    expect(screen.getByText(/请保存您的 API 密钥/)).toBeInTheDocument()
    expect(screen.getByText(/它只显示一次/)).toBeInTheDocument()
  })

  it('calls onCopy when copy button is clicked', async () => {
    const onCopy = vi.fn()
    const user = userEvent.setup()
    render(<KeyAlert keyValue="sk-new-key-123" copied={false} onCopy={onCopy} />)

    const button = screen.getByRole('button')
    await user.click(button)
    expect(onCopy).toHaveBeenCalledTimes(1)
  })

  it('shows copy button when copied is true', () => {
    const onCopy = vi.fn()
    render(<KeyAlert keyValue="sk-new-key-123" copied={true} onCopy={onCopy} />)

    expect(screen.getByRole('button')).toBeInTheDocument()
    expect(screen.getByText('sk-new-key-123')).toBeInTheDocument()
  })
})
