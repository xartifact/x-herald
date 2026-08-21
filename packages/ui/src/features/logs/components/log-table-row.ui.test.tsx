import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'

import type { LogListItem } from '@xartifact/x-herald-shared'

import { LogTableRow } from './log-table-row'

function makeLog(overrides: Partial<LogListItem> = {}): LogListItem {
  return {
    id: 'log-1',
    requestPath: '/api/v1/chat/completions',
    requestMethod: 'POST',
    status: 'success',
    statusCode: 200,
    modelName: 'gpt-4o',
    providerName: 'openai',
    inputTokens: 10,
    outputTokens: 20,
    totalTokens: 30,
    responseTimeMs: 1500,
    createdAt: '2026-08-21T00:00:00.000Z',
    streaming: false,
    thinkingMode: false,
    retryCount: 0,
    virtualKeyName: 'default',
    clientType: 'unknown',
    errorMessage: null,
    ...overrides,
  }
}

function renderRow(log: LogListItem) {
  return render(
    <table>
      <tbody>
        <LogTableRow
          log={log}
          onViewDetail={() => {}}
          onDelete={() => {}}
          formatDuration={(ms) => `${ms}ms`}
          formatTokens={(n) => String(n)}
        />
      </tbody>
    </table>,
  )
}

describe('LogTableRow badge placement', () => {
  it('renders streaming and thinking badges inside the model cell', () => {
    const { container } = renderRow(
      makeLog({ streaming: true, thinkingMode: true, requestCategory: 'chat_text' }),
    )
    expect(container.textContent).toContain('流式')
    expect(container.textContent).toContain('思考')
    // 模型列 = 第一个数据单元格（Index 0 是状态列，Index 1 是模型列）
    const cells = container.querySelectorAll('td')
    const modelCell = cells[1]
    expect(modelCell.textContent).toContain('流式')
    expect(modelCell.textContent).toContain('思考')
  })

  it('does not render streaming/thinking badges in the key column', () => {
    const { container } = renderRow(makeLog({ streaming: true, thinkingMode: true }))
    const cells = container.querySelectorAll('td')
    // 密钥列 = 状态/模型/响应时间/Token 之后的第 5 个单元格
    const keyCell = cells[4]
    expect(keyCell.textContent).toContain('default')
    expect(keyCell.textContent).not.toContain('流式')
    expect(keyCell.textContent).not.toContain('思考')
  })
})
