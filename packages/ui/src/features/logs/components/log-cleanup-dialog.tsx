import { useState } from 'react'
import { Button } from '../../../shared/components/ui/button'
import { Input } from '../../../shared/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '../../../shared/components/ui/dialog'
import type { LogStorage } from '@xartifact/x-llm-gateway-shared'

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
  const [error, setError] = useState<string | null>(null)

  const handleRetentionChange = (value: string) => {
    onRetentionChange(value)
    const parsedDays = Number(value)
    if (Number.isNaN(parsedDays) || parsedDays < 1 || parsedDays > 365) {
      setError('请输入 1-365 之间的天数')
    } else {
      setError(null)
    }
  }

  const isValid =
    !error && retentionDays !== '' && Number(retentionDays) >= 1 && Number(retentionDays) <= 365

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>清理过期日志</DialogTitle>
          <DialogDescription>设置日志保留天数，系统将删除超过该天数的日志记录。</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label htmlFor="retention-days" className="text-sm font-medium">
              保留天数
            </label>
            <Input
              id="retention-days"
              type="number"
              min={1}
              max={365}
              value={retentionDays}
              onChange={(e) => handleRetentionChange(e.target.value)}
              placeholder="例如：30"
            />
            <p className="text-xs text-muted-foreground">
              请输入 1-365 之间的天数。超过该天数的日志将被永久删除。
            </p>
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {storage && (
            <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
              <div className="text-sm font-medium">存储信息</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">总日志数:</span>{' '}
                  <span className="font-medium">{storage.totalCount.toLocaleString()}</span>
                </div>
                {storage.oldestLogDate && (
                  <div>
                    <span className="text-muted-foreground">最早日期:</span>{' '}
                    <span className="font-medium">
                      {new Date(storage.oldestLogDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {storage.newestLogDate && (
                  <div>
                    <span className="text-muted-foreground">最新日期:</span>{' '}
                    <span className="font-medium">
                      {new Date(storage.newestLogDate).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {storage.estimatedExpiredLogs && storage.estimatedExpiredLogs !== 'undefined' && (
                  <p className="text-sm text-muted-foreground">
                    预计可清理: {storage.estimatedExpiredLogs} 条
                  </p>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            取消
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending || !isValid}>
            {isPending ? '清理中...' : '确认清理'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
