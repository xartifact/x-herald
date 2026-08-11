import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'

import { DeployBanner } from './deploy-banner'

describe('DeployBanner', () => {
  it('shows 已同步 when clean', () => {
    render(<DeployBanner isDirty={false} isDeploying={false} onDeploy={() => {}} />)
    expect(screen.getByText('已同步')).toBeDefined()
  })

  it('shows discard while dirty when onDiscardDraft provided', () => {
    const onDiscard = vi.fn(() => {})
    render(
      <DeployBanner isDirty isDeploying={false} onDeploy={() => {}} onDiscardDraft={onDiscard} />,
    )
    expect(screen.getByText('有未部署的变更')).toBeDefined()
    const discard = screen.getByRole('button', { name: '放弃草稿' })
    fireEvent.click(discard)
    expect(onDiscard).toHaveBeenCalledTimes(1)
  })

  it('shows validation error count next to deploy when dirty', () => {
    render(
      <DeployBanner isDirty isDeploying={false} validationErrorCount={3} onDeploy={() => {}} />,
    )
    expect(screen.getByText('3 项错误')).toBeDefined()
    expect(screen.getByRole('button', { name: '部署' })).toBeDefined()
  })
})
