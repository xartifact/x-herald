export function cn(...args: (string | undefined | false | null)[]) {
  return args.filter(Boolean).join(' ')
}

export function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function responseTimeColor(ms: number | null): string {
  if (ms == null) return ''
  if (ms < 3000) return 'text-green-600'
  if (ms < 10000) return 'text-yellow-600'
  return 'text-red-600'
}

export function responseTimeQuality(ms: number | null): { className: string; label: string } {
  if (ms == null) return { className: 'text-muted-foreground', label: '—' }
  if (ms < 3000) return { className: 'text-green-600', label: '良好' }
  if (ms < 10000) return { className: 'text-yellow-600', label: '一般' }
  return { className: 'text-red-600', label: '较差' }
}

export function successRateColor(rate: number | null): string {
  if (rate == null) return ''
  if (rate >= 0.99) return 'text-green-600'
  if (rate >= 0.95) return 'text-yellow-600'
  return 'text-red-600'
}
