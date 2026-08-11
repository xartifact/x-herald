import { Badge } from '../../../shared/components/ui'

interface Props {
  level: 'normal' | 'warning' | 'critical'
  score?: number | null
}

const LEVEL_CONFIG = {
  normal: { label: '正常', className: 'bg-success/10 text-success border-success/20' },
  warning: { label: '异常', className: 'bg-warning/10 text-warning border-warning/20' },
  critical: {
    label: '严重',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
}

export function AnomalyBadge({ level, score }: Props) {
  const config = LEVEL_CONFIG[level]
  return (
    <Badge variant="outline" className={config.className}>
      {config.label}
      {score != null && score > 1 && (
        <span className="ml-1 text-xs opacity-75">×{score.toFixed(1)}</span>
      )}
    </Badge>
  )
}
