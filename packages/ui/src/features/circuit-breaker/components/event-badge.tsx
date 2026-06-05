'use client'

import { Badge } from '../../../shared/components/ui/badge'
import type { CircuitBreakerEventType } from '@x-llm-gateway/shared'
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
        <Badge variant="outline" className="gap-1 border-yellow-400 text-yellow-700">
          <AlertTriangle className="h-3 w-3" />
          半开
        </Badge>
      )
    case 'closed':
      return (
        <Badge variant="outline" className="gap-1 border-green-400 text-green-700">
          <CheckCircle className="h-3 w-3" />
          恢复
        </Badge>
      )
    case 'cooldown':
      return (
        <Badge variant="outline" className="gap-1 border-blue-400 text-blue-700">
          <Timer className="h-3 w-3" />
          冷却
        </Badge>
      )
    case 'reset':
      return (
        <Badge variant="outline" className="gap-1 border-green-400 text-green-700">
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
