'use client'

import { Button } from '@x-llm-gateway/ui'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@x-llm-gateway/ui'
import { Input } from '@x-llm-gateway/ui'
import type { LogStorage } from '@/hooks/use-logs'

interface LogCleanupDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  retentionDays: string
  onRetentionChange: (value: string) => void
  storage?: LogStorage
  isPending: boolean
  onConfirm: () => void
}

export function LogCleanupDialog({
  open,
  onOpenChange,
  retentionDays,
  onRetentionChange,
  storage,
  isPending,
  onConfirm,
}: LogCleanupDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>清理过期日志</DialogTitle>
          <DialogDescription>删除超过指定天数的日志记录</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm font-medium">保留天数</label>
            <Input
              type="number"
              value={retentionDays}
              onChange={(e) => onRetentionChange(e.target.value)}
              min="1"
              max="365"
              className="mt-2"
            />
            <p className="text-xs text-muted-foreground mt-1">
              将删除 {retentionDays} 天前的所有日志
            </p>
          </div>

          {storage && (
            <div className="bg-muted p-3 rounded-md text-sm space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">当前日志总数:</span>
                <span className="font-medium">{storage.totalCount.toLocaleString()}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">估计过期日志:</span>
                <span className="font-medium text-amber-600">{storage.estimatedExpiredLogs} 条</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? '清理中...' : '确认清理'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
