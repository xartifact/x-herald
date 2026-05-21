import { AlertTriangle, CheckCircle, Octagon, RotateCcw, ShieldOff, Timer } from 'lucide-react'

import { Badge } from '@x-llm-gateway/ui'

import type { CBEvent, RealtimeState } from './circuit-breaker-types'

export function stateBadgeColor(state: RealtimeState['state']): string {
  switch (state) {
    case 'closed': return 'text-green-600'
    case 'half_open': return 'text-yellow-600'
    case 'open': return 'text-red-600'
    case 'cooldown': return 'text-blue-600'
  }
}

export function stateLabel(state: RealtimeState['state']): string {
  switch (state) {
    case 'closed': return '正常'
    case 'half_open': return '半开'
    case 'open': return '开路'
    case 'cooldown': return '冷却'
  }
}

export function tripCountBadge(tripCount: number): { color: string; label: string } {
  if (tripCount === 0) return { color: 'bg-gray-100 text-gray-600', label: '0' }
  if (tripCount === 1) return { color: 'bg-gray-100 text-gray-600', label: '1' }
  if (tripCount <= 3) return { color: 'bg-yellow-100 text-yellow-700', label: String(tripCount) }
  return { color: 'bg-orange-100 text-orange-700', label: String(tripCount) }
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '已到期'
  const seconds = Math.round(ms / 1000)
  if (seconds < 60) return `${seconds}秒`
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes}分钟`
  const hours = Math.round(minutes / 60)
  return `${hours}小时`
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000) return `${Math.round(diff / 1000)}秒前`
  if (diff < 3_600_000) return `${Math.round(diff / 60_000)}分钟前`
  if (diff < 86_400_000) return `${Math.round(diff / 3_600_000)}小时前`
  return `${Math.round(diff / 86_400_000)}天前`
}

interface EventBadgeProps {
  event: CBEvent['event']
}

export function EventBadge({ event }: EventBadgeProps) {
  switch (event) {
    case 'opened':
      return (
        <Badge variant="destructive" className="gap-1">
          <ShieldOff className="h-3 w-3" />熔断
        </Badge>
      )
    case 'half_open':
      return (
        <Badge variant="outline" className="gap-1 border-yellow-400 text-yellow-700">
          <AlertTriangle className="h-3 w-3" />半开
        </Badge>
      )
    case 'closed':
      return (
        <Badge variant="outline" className="gap-1 border-green-400 text-green-700">
          <CheckCircle className="h-3 w-3" />恢复
        </Badge>
      )
    case 'cooldown':
      return (
        <Badge variant="outline" className="gap-1 border-blue-400 text-blue-700">
          <Timer className="h-3 w-3" />冷却
        </Badge>
      )
    case 'reset':
      return (
        <Badge variant="outline" className="gap-1 border-green-400 text-green-700">
          <RotateCcw className="h-3 w-3" />重置
        </Badge>
      )
    case 'manual_trip':
      return (
        <Badge variant="destructive" className="gap-1">
          <Octagon className="h-3 w-3" />手动熔断
        </Badge>
      )
  }
}
