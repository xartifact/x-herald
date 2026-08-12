import type { CircuitBreakerState } from '@xartifact/x-herald-shared'

export function stateBadgeColor(state: CircuitBreakerState): string {
  switch (state) {
    case 'closed':
      return 'text-success'
    case 'half_open':
      return 'text-warning'
    case 'open':
      return 'text-destructive'
    case 'cooldown':
      return 'text-info'
  }
}

export function stateLabel(state: CircuitBreakerState): string {
  switch (state) {
    case 'closed':
      return '正常'
    case 'half_open':
      return '半开'
    case 'open':
      return '开路'
    case 'cooldown':
      return '冷却'
  }
}

export function formatDuration(ms: number): string {
  if (ms <= 0) return '已到期'
  if (ms < 60000) return `${Math.round(ms / 1000)}秒`
  if (ms < 3600000) return `${Math.round(ms / 60000)}分钟`
  return `${Math.round(ms / 3600000)}小时`
}

export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 0) return '刚刚'
  if (diff < 60000) return `${Math.round(diff / 1000)}秒前`
  if (diff < 3600000) return `${Math.round(diff / 60000)}分钟前`
  if (diff < 86400000) return `${Math.round(diff / 3600000)}小时前`
  return `${Math.round(diff / 86400000)}天前`
}

export function tripCountBadge(tripCount: number): { color: string; label: string } {
  if (tripCount <= 1) {
    return { color: 'bg-muted text-muted-foreground', label: String(tripCount) }
  }
  if (tripCount <= 3) {
    return { color: 'bg-warning/10 text-warning', label: String(tripCount) }
  }
  return { color: 'bg-warning/10 text-warning', label: String(tripCount) }
}
