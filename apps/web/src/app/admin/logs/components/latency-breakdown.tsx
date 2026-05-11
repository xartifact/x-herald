'use client'

import { cn } from '@/core/lib/utils'

/**
 * 延迟链路分段可视化
 */
export interface LatencyBreakdownProps {
  totalMs: number
  gatewayOverheadMs?: number
  providerTtfbMs?: number
  streamDurationMs?: number
  ttfbToFirstThinkingMs?: number
  ttfbToFirstTextMs?: number
  thinkingDurationMs?: number
  formatDuration: (ms: number) => string
}

export function LatencyBreakdown({
  totalMs,
  gatewayOverheadMs,
  providerTtfbMs,
  streamDurationMs,
  ttfbToFirstThinkingMs,
  ttfbToFirstTextMs,
  thinkingDurationMs,
  formatDuration,
}: LatencyBreakdownProps) {
  const segments: Array<{
    label: string
    ms: number
    color: string
    bgColor: string
  }> = []

  if (gatewayOverheadMs != null && gatewayOverheadMs > 0) {
    segments.push({
      label: '网关预处理',
      ms: gatewayOverheadMs,
      color: 'text-blue-600',
      bgColor: 'bg-blue-500',
    })
  }
  if (providerTtfbMs != null && providerTtfbMs > 0) {
    segments.push({
      label: 'Provider TTFB',
      ms: providerTtfbMs,
      color: 'text-amber-600',
      bgColor: 'bg-amber-500',
    })
  }

  if (streamDurationMs != null && streamDurationMs > 0) {
    const isThinking = thinkingDurationMs != null && thinkingDurationMs > 0

    if (isThinking && ttfbToFirstThinkingMs != null) {
      // 思考 + 流式：首字时间 = providerTtfbMs + ttfbToFirstThinkingMs
      // HTTP头 → 首thinking token（首字边界）
      segments.push({
        label: '首思考等待',
        ms: ttfbToFirstThinkingMs,
        color: 'text-orange-600',
        bgColor: 'bg-orange-400',
      })
      // 首thinking token → 首text token（思考流）
      segments.push({
        label: '思考',
        ms: thinkingDurationMs,
        color: 'text-violet-600',
        bgColor: 'bg-violet-500',
      })
      // 首text token → 流结束（纯文本生成）
      const textGenMs = ttfbToFirstTextMs != null
        ? streamDurationMs - ttfbToFirstTextMs
        : streamDurationMs - ttfbToFirstThinkingMs - thinkingDurationMs
      if (textGenMs > 0) {
        segments.push({
          label: '文本生成',
          ms: textGenMs,
          color: 'text-green-600',
          bgColor: 'bg-green-500',
        })
      }
    } else if (ttfbToFirstTextMs != null && ttfbToFirstTextMs > 0) {
      // 非思考 + 流式：首字时间 = providerTtfbMs + ttfbToFirstTextMs
      // HTTP头 → 首text token（首字边界）
      segments.push({
        label: '首字等待',
        ms: ttfbToFirstTextMs,
        color: 'text-amber-500',
        bgColor: 'bg-amber-400',
      })
      const textGenMs = streamDurationMs - ttfbToFirstTextMs
      if (textGenMs > 0) {
        segments.push({
          label: '文本生成',
          ms: textGenMs,
          color: 'text-green-600',
          bgColor: 'bg-green-500',
        })
      }
    } else {
      // 无首token时间数据，整体显示
      segments.push({
        label: '流式传输',
        ms: streamDurationMs,
        color: 'text-green-600',
        bgColor: 'bg-green-500',
      })
    }
    // 非流式：不加streaming段，providerTtfbMs 已包含网络+推理全部时间
  }

  if (segments.length === 0) return null

  const segmentTotal = segments.reduce((sum, s) => sum + s.ms, 0)
  const otherMs = totalMs - segmentTotal
  if (otherMs > 10) {
    segments.push({
      label: '其他',
      ms: otherMs,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted-foreground/40',
    })
  }

  return (
    <div className="px-4 py-3 space-y-2">
      {/* 时间线条 */}
      <div className="flex h-2 rounded-full overflow-hidden gap-px">
        {segments.map((seg) => {
          const pct = Math.max((seg.ms / totalMs) * 100, 2)
          return (
            <div
              key={seg.label}
              className={cn('rounded-sm transition-all', seg.bgColor)}
              style={{ width: `${pct}%` }}
              title={`${seg.label}: ${formatDuration(seg.ms)}`}
            />
          )
        })}
      </div>
      {/* 图例 */}
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {segments.map((seg) => (
          <div key={seg.label} className="flex items-center gap-1.5 text-[11px]">
            <div className={cn('w-2 h-2 rounded-sm', seg.bgColor)} />
            <span className="text-muted-foreground">{seg.label}</span>
            <span className={cn('font-mono font-medium', seg.color)}>
              {formatDuration(seg.ms)}
            </span>
            <span className="text-muted-foreground/60">
              ({Math.round((seg.ms / totalMs) * 100)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}