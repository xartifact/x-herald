import { Badge } from '../../../shared/components/ui/badge'
import type { CircuitBreakerEventType } from '@xartifact/x-herald-shared'
import { ShieldOff, AlertTriangle, CheckCircle, Timer, RotateCcw, Octagon } from 'lucide-react'

interface EventBadgeProps {
  event: CircuitBreakerEventType
}

export function EventBadge({ event }: EventBadgeProps) {
  switch (event) {
    case 'opened':
      return (
        <Badge variant="destructive" className="gap-1">
          <ShieldOff className="h-3 w-3" />
          熔断
        </Badge>
      )
    case 'half_open':
      return (
        <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
          <AlertTriangle className="h-3 w-3" />
          半开
        </Badge>
      )
    case 'closed':
      return (
        <Badge variant="outline" className="gap-1 border-success/40 text-success">
          <CheckCircle className="h-3 w-3" />
          恢复
        </Badge>
      )
    case 'cooldown':
      return (
        <Badge variant="outline" className="gap-1 border-info/40 text-info">
          <Timer className="h-3 w-3" />
          冷却
        </Badge>
      )
    case 'reset':
      return (
        <Badge variant="outline" className="gap-1 border-success/40 text-success">
          <RotateCcw className="h-3 w-3" />
          重置
        </Badge>
      )
    case 'manual_trip':
      return (
        <Badge variant="destructive" className="gap-1">
          <Octagon className="h-3 w-3" />
          手动熔断
        </Badge>
      )
  }
}
