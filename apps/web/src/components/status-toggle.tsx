'use client'

import { cn } from '@x-llm-gateway/ui'

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
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
        enabled
          ? 'bg-primary text-primary-foreground hover:bg-primary/80'
          : 'bg-destructive text-destructive-foreground hover:bg-destructive/80',
      )}
    >
      {enabled ? enabledLabel : disabledLabel}
    </button>
  )
}
