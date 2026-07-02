import { Badge } from '../../../shared/components/ui'

interface Props {
  level: 'normal' | 'warning' | 'critical'
  score?: number | null
}

const LEVEL_CONFIG = {
  normal: { label: '正常', className: 'bg-green-50 text-green-700 border-green-200' },
  warning: { label: '异常', className: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  critical: { label: '严重', className: 'bg-red-50 text-red-700 border-red-200' },
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
