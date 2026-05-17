export function responseTimeQuality(ms: number): { label: string; className: string } {
  if (ms < 1000) return { label: '优秀', className: 'bg-green-50 text-green-700 border-green-200' }
  if (ms < 3000) return { label: '良好', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' }
  return { label: '较差', className: 'bg-red-50 text-red-700 border-red-200' }
}

export function responseTimeColor(ms: number): string {
  if (ms < 1000) return 'text-green-600'
  if (ms < 3000) return 'text-yellow-600'
  return 'text-red-600'
}

export function successRateColor(rate: number): string {
  if (rate >= 0.95) return 'text-green-600'
  if (rate >= 0.80) return 'text-yellow-600'
  return 'text-red-600'
}

export function formatMs(ms: number): string {
  if (ms >= 60_000) return `${(ms / 60_000).toFixed(1)}m`
  if (ms >= 1_000) return `${(ms / 1_000).toFixed(1)}s`
  return `${Math.round(ms)}ms`
}
