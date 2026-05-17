'use client'

import { cn } from '@/core/lib/utils'

export interface LatencyTimings {
  gatewayOverheadMs?: number | null
  providerTtfbMs?: number | null
  streamDurationMs?: number | null
  ttfbToFirstThinkingMs?: number | null
  ttfbToFirstTextMs?: number | null
  thinkingDurationMs?: number | null
}

interface Segment { label: string; ms: number; color: string; bgColor: string }

function buildLatencySegments(timings: LatencyTimings, totalMs: number): Segment[] {
  const segs: Segment[] = []

  if (timings.gatewayOverheadMs) {
    segs.push({ label: '网关预处理', ms: timings.gatewayOverheadMs, color: 'text-blue-600', bgColor: 'bg-blue-500' })
  }
  if (timings.providerTtfbMs) {
    segs.push({ label: 'Provider TTFB', ms: timings.providerTtfbMs, color: 'text-amber-600', bgColor: 'bg-amber-500' })
  }

  const { streamDurationMs, thinkingDurationMs, ttfbToFirstThinkingMs, ttfbToFirstTextMs } = timings
  if (streamDurationMs) {
    const isThinking = thinkingDurationMs != null && thinkingDurationMs > 0
    if (isThinking && ttfbToFirstThinkingMs != null) {
      segs.push({ label: '首思考等待', ms: ttfbToFirstThinkingMs, color: 'text-orange-600', bgColor: 'bg-orange-400' })
      segs.push({ label: '思考', ms: thinkingDurationMs!, color: 'text-violet-600', bgColor: 'bg-violet-500' })
      const textGenMs = ttfbToFirstTextMs != null
        ? streamDurationMs - ttfbToFirstTextMs
        : streamDurationMs - ttfbToFirstThinkingMs - thinkingDurationMs!
      if (textGenMs > 0) segs.push({ label: '文本生成', ms: textGenMs, color: 'text-green-600', bgColor: 'bg-green-500' })
    } else if (ttfbToFirstTextMs != null && ttfbToFirstTextMs > 0) {
      segs.push({ label: '首字等待', ms: ttfbToFirstTextMs, color: 'text-amber-500', bgColor: 'bg-amber-400' })
      const textGenMs = streamDurationMs - ttfbToFirstTextMs
      if (textGenMs > 0) segs.push({ label: '文本生成', ms: textGenMs, color: 'text-green-600', bgColor: 'bg-green-500' })
    } else {
      segs.push({ label: '流式传输', ms: streamDurationMs, color: 'text-green-600', bgColor: 'bg-green-500' })
    }
  }

  const segTotal = segs.reduce((sum, s) => sum + s.ms, 0)
  const otherMs = totalMs - segTotal
  if (otherMs > 10) segs.push({ label: '其他', ms: otherMs, color: 'text-muted-foreground', bgColor: 'bg-muted-foreground/40' })

  return segs
}

interface LatencyBreakdownProps {
  totalMs: number
  timings: LatencyTimings
  formatDuration: (ms: number) => string
}

export function LatencyBreakdown({ totalMs, timings, formatDuration }: LatencyBreakdownProps) {
  const segments = buildLatencySegments(timings, totalMs)
  if (segments.length === 0) return null

  return (
    <div className="px-4 py-3 space-y-2">
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {segments.map((seg) => (
          <div
            key={seg.label}
            className={cn('rounded-sm transition-all', seg.bgColor)}
            style={{ width: `${Math.max((seg.ms / totalMs) * 100, 2)}%` }}
            title={`${seg.label}: ${formatDuration(seg.ms)}`}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-[11px]">
            <div className={cn('w-2 h-2 rounded-sm', seg.bgColor)} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className={cn('font-mono font-medium', seg.color)}>{formatDuration(seg.ms)}</span>
            <span className="text-muted-foreground/60">({Math.round((seg.ms / totalMs) * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  )
}
