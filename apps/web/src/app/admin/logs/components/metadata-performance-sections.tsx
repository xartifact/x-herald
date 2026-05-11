'use client'

import { cn } from '@/core/lib/utils'
import type { Log } from '@/hooks/use-logs'

import { LatencyBreakdown } from './latency-breakdown'
import { InfoRow, Section } from './log-info-row'
import type { ContentFeatures } from './utils/extract-content-features'

interface MetadataPerformanceSectionsProps {
  log: Log
  isPending: boolean
  isSuccess: boolean
  contentFeatures: ContentFeatures | null
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

export function MetadataPerformanceSections({
  log,
  isPending: _isPending,
  isSuccess: _isSuccess,
  contentFeatures,
  formatDuration,
  formatTokens,
}: MetadataPerformanceSectionsProps) {
  return (
    <>
{/* === 响应时间分析 === */}
      <Section title="响应时间分析">
        <InfoRow
          label="总响应时间"
          value={
            <span className={cn(
              "font-semibold",
              log.responseTimeMs < 1000 ? "text-green-600" :
              log.responseTimeMs < 3000 ? "text-amber-600" :
              "text-red-600",
            )}
            >
              {formatDuration(log.responseTimeMs)}
            </span>
          }
        />
        {log.metadata?.performance && (
          log.metadata.performance.gatewayOverheadMs != null ||
          log.metadata.performance.providerTtfbMs != null ||
          log.metadata.performance.streamDurationMs != null
        ) && (
          <LatencyBreakdown
            totalMs={log.responseTimeMs}
            gatewayOverheadMs={log.metadata.performance.gatewayOverheadMs}
            providerTtfbMs={log.metadata.performance.providerTtfbMs}
            streamDurationMs={log.metadata.performance.streamDurationMs}
            ttfbToFirstThinkingMs={log.metadata.performance.ttfbToFirstThinkingMs}
            ttfbToFirstTextMs={log.metadata.performance.ttfbToFirstTextMs}
            thinkingDurationMs={log.metadata.performance.thinkingDurationMs}
            formatDuration={formatDuration}
          />
        )}
        {log.metadata?.performance?.ttfbToFirstThinkingMs != null && (
          <InfoRow
            label="首 Thinking"
            value={
              <span className="font-mono text-purple-600">
                {formatDuration(log.metadata.performance.ttfbToFirstThinkingMs)}
              </span>
            }
          />
        )}
        {log.metadata?.performance?.ttfbToFirstTextMs != null && (
          <InfoRow
            label="首 Token (TTFT)"
            value={
              <span className="font-mono text-green-600">
                {formatDuration(log.metadata.performance.ttfbToFirstTextMs)}
              </span>
            }
          />
        )}
        {log.metadata?.performance?.thinkingDurationMs != null && (
          <InfoRow
            label="思考时长"
            value={
              <span className="font-mono text-violet-600 font-semibold">
                {formatDuration(log.metadata.performance.thinkingDurationMs)}
              </span>
            }
          />
        )}
        <InfoRow
          label="思考模式"
          value={
            log.metadata?.request?.thinkingMode
              ? <span className="text-violet-600 font-semibold">开启</span>
              : <span className="text-muted-foreground">关闭</span>
          }
        />
        <InfoRow label="流式传输" value={log.streaming ? '是' : '否'} />
        <InfoRow
          label="重试次数"
          value={log.retryCount > 0
            ? <span className="text-orange-600 font-semibold">{log.retryCount}</span>
            : '0'
          }
        />
      </Section>

      {/* === Token 用量 === */}
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
                  <span className={cn(
                    "font-semibold",
                    contentFeatures.tokens.tokensPerSecond >= 80 ? "text-green-600" :
                    contentFeatures.tokens.tokensPerSecond >= 30 ? "text-blue-600" :
                    "text-amber-600"
                  )}>
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

