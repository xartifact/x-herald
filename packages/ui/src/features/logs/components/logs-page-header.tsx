'use client'

import { Trash2 } from 'lucide-react'

import { Button } from '../../../shared/components/ui/button'

interface LogsPageHeaderProps {
  onCleanup: () => void
}

export function LogsPageHeader({ onCleanup }: LogsPageHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">请求日志</h2>
        <p className="text-sm text-muted-foreground mt-1">查看和分析所有 API 请求记录</p>
      </div>
      <Button variant="outline" onClick={onCleanup}>
        <Trash2 className="mr-2 h-4 w-4" />
        清理过期日志
      </Button>
    </div>
  )
}
