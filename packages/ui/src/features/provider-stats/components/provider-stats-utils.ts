import { successRateTone, responseTimeTone } from '../../../shared/lib/health-tone'
import { STAT_TONE_CLASS } from '../../../shared/components/stat-card'

export function formatMs(ms: number | null): string {
  if (ms == null) return '—'
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`
}

export function responseTimeColor(ms: number | null): string {
  return STAT_TONE_CLASS[responseTimeTone(ms)]
}

export function responseTimeQuality(ms: number | null): { className: string; label: string } {
  if (ms == null) return { className: 'text-muted-foreground', label: '—' }
  const labels = { success: '良好', warning: '一般', danger: '较差' } as const
  const tone = responseTimeTone(ms) as keyof typeof labels
  return { className: STAT_TONE_CLASS[tone], label: labels[tone] }
}

export function successRateColor(rate: number | null): string {
  return STAT_TONE_CLASS[successRateTone(rate)]
}
