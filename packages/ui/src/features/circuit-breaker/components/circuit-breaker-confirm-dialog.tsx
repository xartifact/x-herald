'use client'

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../shared/components/ui/dialog'
import { Button } from '../../../shared/components/ui/button'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  instanceId: string
  action: 'reset' | 'trip'
  pending: boolean
  onConfirm: () => void
}

export function CircuitBreakerConfirmDialog({
  open,
  onOpenChange,
  instanceId,
  action,
  pending,
  onConfirm,
}: Props) {
  const displayId = instanceId.slice(0, 12)
  const isTrip = action === 'trip'

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isTrip ? '确认强制熔断' : '确认重置熔断'}</DialogTitle>
          <DialogDescription>
            {isTrip
              ? `实例 ${displayId} 将被排除在路由之外。`
              : `实例 ${displayId} 将恢复正常路由。`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            取消
          </Button>
          <Button
            variant={isTrip ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={pending}
          >
            {pending ? '处理中...' : '确认'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
