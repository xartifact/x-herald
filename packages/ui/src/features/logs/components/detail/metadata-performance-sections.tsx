import { cn } from '../../../../shared/lib/utils'
import type { Log } from '@xartifact/x-herald-shared'

import { LatencyBreakdown } from './latency-breakdown'
import { InfoRow, Section } from './log-info-row'
import type { ContentFeatures } from './extract-content-features'

interface MetadataPerformanceSectionsProps {
  log: Log
  contentFeatures: ContentFeatures | null
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

export function MetadataPerformanceSections({
  log,
  contentFeatures,
  formatDuration,
  formatTokens,
}: MetadataPerformanceSectionsProps) {
  const perf = log.metadata?.performance
  const hasBreakdown =
    perf &&
    (perf.gatewayOverheadMs != null || perf.providerTtfbMs != null || perf.streamDurationMs != null)

  return (
    <>
      <Section title="响应时间分析">
        <InfoRow
          label="总响应时间"
          value={
            <span
              className={cn(
                'font-semibold',
                log.responseTimeMs < 1000
                  ? 'text-success'
                  : log.responseTimeMs < 3000
                    ? 'text-warning'
                    : 'text-destructive',
              )}
            >
              {formatDuration(log.responseTimeMs)}
            </span>
          }
        />
        {hasBreakdown && <LatencyBreakdown log={log} />}
        {perf?.ttfbToFirstThinkingMs != null && (
          <InfoRow
            label="首 Thinking"
            value={
              <span className="font-mono text-info">
                {formatDuration(perf.ttfbToFirstThinkingMs)}
              </span>
            }
          />
        )}
        {perf?.ttfbToFirstTextMs != null && (
          <InfoRow
            label="首 Token (TTFT)"
            value={
              <span className="font-mono text-success">
                {formatDuration(perf.ttfbToFirstTextMs)}
              </span>
            }
          />
        )}
        {perf?.thinkingDurationMs != null && (
          <InfoRow
            label="思考时长"
            value={
              <span className="font-mono text-info font-semibold">
                {formatDuration(perf.thinkingDurationMs)}
              </span>
            }
          />
        )}
        <InfoRow
          label="思考模式"
          value={
            log.metadata?.request?.thinkingMode ? (
              <span className="text-info font-semibold">开启</span>
            ) : (
              <span className="text-muted-foreground">关闭</span>
            )
          }
        />
        <InfoRow label="流式传输" value={log.streaming ? '是' : '否'} />
        <InfoRow
          label="重试次数"
          value={
            log.retryCount > 0 ? (
              <span className="text-warning font-semibold">{log.retryCount}</span>
            ) : (
              '0'
            )
          }
        />
      </Section>

      <Section title="Token 用量">
        <InfoRow label="输入 Token" value={formatTokens(log.inputTokens)} mono />
        <InfoRow label="输出 Token" value={formatTokens(log.outputTokens)} mono />
        <InfoRow
          label="总 Token"
          value={<span className="font-semibold">{formatTokens(log.totalTokens)}</span>}
          mono
        />
        {contentFeatures?.tokens && (
          <>
            <InfoRow
              label="Token 分布"
              value={
                <div className="flex items-center gap-2 text-xs">
                  <span>输入: {contentFeatures.tokens.inputOutputRatio.input}%</span>
                  <span className="text-muted-foreground">|</span>
                  <span>输出: {contentFeatures.tokens.inputOutputRatio.output}%</span>
                </div>
              }
            />
            {contentFeatures.tokens.tokensPerSecond > 0 && (
              <InfoRow
                label="生成速率"
                value={
                  <span
                    className={cn(
                      'font-semibold',
                      contentFeatures.tokens.tokensPerSecond >= 80
                        ? 'text-success'
                        : contentFeatures.tokens.tokensPerSecond >= 30
                          ? 'text-info'
                          : 'text-warning',
                    )}
                  >
                    {contentFeatures.tokens.tokensPerSecond} tokens/s
                  </span>
                }
                mono
              />
            )}
            {contentFeatures.tokens.tokensPerMessage > 0 && (
              <InfoRow
                label="每消息 Token"
                value={`${contentFeatures.tokens.tokensPerMessage} tokens`}
                mono
              />
            )}
          </>
        )}
      </Section>
    </>
  )
}
