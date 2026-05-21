'use client'

import { Copy, Check } from 'lucide-react'

import { Button } from '../ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'

interface KeyResetDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  resetKeyValue: string | null
  copied: boolean
  isPending: boolean
  onConfirm: () => void
  onCopy: () => void
  onCancel: () => void
}

export function KeyResetDialog({
  open,
  onOpenChange,
  resetKeyValue,
  copied,
  isPending,
  onConfirm,
  onCopy,
  onCancel,
}: KeyResetDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>重置密钥</DialogTitle>
          <DialogDescription>
            确定要重置此密钥吗？重置后将生成新的 API 密钥，旧密钥将立即失效。
          </DialogDescription>
        </DialogHeader>

        {resetKeyValue && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
            <p className="font-medium text-yellow-800 mb-2">请保存新的 API 密钥！</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-yellow-100 px-2 py-1 rounded text-sm font-mono break-all">
                {resetKeyValue}
              </code>
              <Button size="sm" variant="outline" onClick={onCopy}>
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            {resetKeyValue ? '关闭' : '取消'}
          </Button>
          {!resetKeyValue && (
            <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
              {isPending ? '重置中...' : '确认重置'}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
