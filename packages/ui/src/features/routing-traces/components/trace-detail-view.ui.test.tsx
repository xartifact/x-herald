import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { RoutingTraceDetailResponse } from '../api'
import { RoutingTraceDetailView } from './trace-detail-view'

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => vi.fn(),
}))

function makeTrace(
  overrides: Partial<RoutingTraceDetailResponse> = {},
): RoutingTraceDetailResponse {
  return {
    logId: 'log-1',
    requestGroupId: 'rg-1',
    requestedModel: 'gpt-4',
    accessModelName: 'gpt-4',
    outcome: 'success',
    totalAttempts: 2,
    totalDurationMs: 1234,
    createdAt: '2026-08-15T10:00:00.000Z',
    requestLogId: 'log-1',
    chain: [
      {
        index: 0,
        kind: 'single',
        actionType: 'priority',
        resolvedGroupId: 'g-1',
        resolvedGroupName: 'GPT 主组',
        candidates: [
          {
            candidateIndex: 0,
            chainStepIndex: 0,
            chainStepKind: 'single',
            instanceId: 'i1',
            instanceName: 'gpt-4o',
            providerId: 'p1',
            providerName: 'OpenAI',
            priority: 0,
            strategy: 'priority',
            groupName: 'GPT 主组',
            selectionReason: 'primary selection: priority 0',
            matched: true,
            status: 'success',
            statusCode: 200,
            durationMs: 1000,
          },
          {
            candidateIndex: 1,
            chainStepIndex: 0,
            chainStepKind: 'single',
            instanceId: 'i2',
            instanceName: 'gpt-4-turbo',
            providerId: 'p1',
            providerName: 'OpenAI',
            priority: 1,
            strategy: 'priority',
            groupName: 'GPT 主组',
            selectionReason: 'failover candidate #2: priority 1',
            matched: true,
            status: 'failed',
            statusCode: 500,
            failoverReason: 'http_5xx',
            durationMs: 20,
          },
        ],
        filteredOut: [{ instanceName: 'gpt-4o-mini', reason: 'streaming not supported' }],
      },
      {
        index: 1,
        kind: 'backup',
        actionType: 'priority',
        resolvedGroupId: 'g-2',
        resolvedGroupName: 'Anthropic 备组',
        candidates: [
          {
            candidateIndex: 2,
            chainStepIndex: 1,
            chainStepKind: 'backup',
            instanceId: 'i3',
            instanceName: 'claude-3',
            providerId: 'p2',
            providerName: 'Anthropic',
            priority: 0,
            strategy: 'priority',
            groupName: 'Anthropic 备组',
            selectionReason: 'failover candidate #3: priority 0',
            matched: false,
          },
        ],
      },
    ],
    finalCandidate: {
      chainStepIndex: 0,
      chainStepKind: 'single',
      candidateIndex: 0,
      instanceId: 'i1',
      instanceName: 'gpt-4o',
      providerId: 'p1',
      providerName: 'OpenAI',
    },
    ...overrides,
  }
}

describe('RoutingTraceDetailView grouping', () => {
  it('renders each chain step as a collapsible group with counts', () => {
    render(<RoutingTraceDetailView trace={makeTrace()} />)

    // 两组 header（按钮内组名）
    expect(screen.getByRole('button', { name: /GPT 主组/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Anthropic 备组/ })).toBeInTheDocument()
    // 组内候选可见
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
    expect(screen.getByText('claude-3')).toBeInTheDocument()
    // 过滤原因可见
    expect(screen.getByText('同组未入选（过滤原因）:')).toBeInTheDocument()
    expect(screen.getByText('streaming not supported')).toBeInTheDocument()
  })

  it('collapses a step on header click, hiding its candidates', async () => {
    const user = userEvent.setup()
    render(<RoutingTraceDetailView trace={makeTrace()} />)

    // 折叠主组
    await user.click(screen.getByRole('button', { name: /GPT 主组/ }))
    expect(screen.queryByText('gpt-4o')).not.toBeInTheDocument()
    // 备组仍展开
    expect(screen.getByText('claude-3')).toBeInTheDocument()

    // 再次点击展开
    await user.click(screen.getByRole('button', { name: /GPT 主组/ }))
    expect(screen.getByText('gpt-4o')).toBeInTheDocument()
  })

  it('marks the final candidate with 最终出口 badge', () => {
    render(<RoutingTraceDetailView trace={makeTrace()} />)
    expect(screen.getAllByText('最终出口')).toHaveLength(1)
  })
})

describe('RoutingTraceDetailView step-level decisionReason', () => {
  it('renders step-level decisionReason in the group header when set', () => {
    const trace = makeTrace({
      chain: [
        {
          index: 0,
          kind: 'single',
          actionType: 'intent',
          resolvedGroupId: 'g-1',
          resolvedGroupName: 'Coding 组',
          intentName: 'coding',
          intentSource: 'classifier',
          decisionReason: "intent classified as 'coding' via classifier (92% confidence)",
          candidates: [
            {
              candidateIndex: 0,
              chainStepIndex: 0,
              chainStepKind: 'single',
              instanceId: 'i1',
              instanceName: 'coding-model',
              providerId: 'p1',
              providerName: 'Provider',
              priority: 0,
              strategy: 'priority',
              groupName: 'Coding 组',
              selectionReason: 'primary selection: priority 0',
              matched: true,
              status: 'success',
              statusCode: 200,
              durationMs: 100,
            },
          ],
        },
      ],
      finalCandidate: {
        chainStepIndex: 0,
        chainStepKind: 'single',
        candidateIndex: 0,
        instanceId: 'i1',
        instanceName: 'coding-model',
        providerId: 'p1',
        providerName: 'Provider',
      },
    })
    render(<RoutingTraceDetailView trace={trace} />)
    expect(screen.getByText(/intent classified as 'coding' via classifier/)).toBeInTheDocument()
  })

  it('does not render decisionReason line when step has none', () => {
    render(<RoutingTraceDetailView trace={makeTrace()} />)
    // route_to_group step 无 decisionReason；不期望 step-level reason 出现
    expect(screen.queryByText(/intent classified/)).not.toBeInTheDocument()
    expect(screen.queryByText(/capability matched/)).not.toBeInTheDocument()
  })
})
