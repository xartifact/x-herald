import { cn } from '../lib/utils'

interface StatusToggleProps {
  enabled: boolean
  onToggle: () => void
  disabled?: boolean
  enabledLabel?: string
  disabledLabel?: string
}

export function StatusToggle({
  enabled,
  onToggle,
  disabled = false,
  enabledLabel = '启用',
  disabledLabel = '禁用',
}: StatusToggleProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={enabled}
      title={enabled ? `点击${disabledLabel}` : `点击${enabledLabel}`}
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        enabled
          ? 'bg-[var(--xa-success-soft)] text-[var(--xa-success)] hover:opacity-80'
          : 'bg-muted text-muted-foreground hover:bg-muted/80',
      )}
    >
      {enabled ? enabledLabel : disabledLabel}
    </button>
  )
}
