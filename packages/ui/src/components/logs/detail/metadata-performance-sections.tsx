'use client'

import { cn } from '../../../lib/utils'
import type { Log } from '@x-llm-gateway/shared'

import { LatencyBreakdown } from './latency-breakdown'
import { InfoRow, Section } from './log-info-row'

interface MetadataPerformanceSectionsProps {
  log: Log
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

export function MetadataPerformanceSections({ log, formatDuration, formatTokens }: MetadataPerformanceSectionsProps) {
  const perf = log.metadata?.performance
  const hasBreakdown = perf && (perf.gatewayOverheadMs != null || perf.providerTtfbMs != null || perf.streamDurationMs != null)

  return (
    <>
      <Section title="响应时间分析">
        <InfoRow label="总响应时间">
          <span className={cn('font-semibold',
            log.responseTimeMs < 1000 ? 'text-green-600' : log.responseTimeMs < 3000 ? 'text-amber-600' : 'text-red-600',
          )}>
            {formatDuration(log.responseTimeMs)}
          </span>
        </InfoRow>
        {hasBreakdown && (
          <LatencyBreakdown log={log} />
        )}
        {perf?.ttfbToFirstThinkingMs != null && (
          <InfoRow label="首 Thinking">
            <span className="font-mono text-purple-600">{formatDuration(perf.ttfbToFirstThinkingMs)}</span>
          </InfoRow>
        )}
        {perf?.ttfbToFirstTextMs != null && (
          <InfoRow label="首 Token (TTFT)">
            <span className="font-mono text-green-600">{formatDuration(perf.ttfbToFirstTextMs)}</span>
          </InfoRow>
        )}
        {perf?.thinkingDurationMs != null && (
          <InfoRow label="思考时长">
            <span className="font-mono text-violet-600 font-semibold">{formatDuration(perf.thinkingDurationMs)}</span>
          </InfoRow>
        )}
        <InfoRow label="思考模式">
          {log.metadata?.request?.thinkingMode ? <span className="text-violet-600 font-semibold">开启</span> : <span className="text-muted-foreground">关闭</span>}
        </InfoRow>
        <InfoRow label="流式传输">{log.streaming ? '是' : '否'}</InfoRow>
        <InfoRow label="重试次数">
          {log.retryCount > 0 ? <span className="text-orange-600 font-semibold">{log.retryCount}</span> : '0'}
        </InfoRow>
      </Section>

      <Section title="Token 用量">
        <InfoRow label="输入 Token">{formatTokens(log.inputTokens)}</InfoRow>
        <InfoRow label="输出 Token">{formatTokens(log.outputTokens)}</InfoRow>
        <InfoRow label="总 Token">
          <span className="font-semibold">{formatTokens(log.totalTokens)}</span>
        </InfoRow>
      </Section>
    </>
  )
}
