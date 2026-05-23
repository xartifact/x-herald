'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export interface ListPaginationProps {
  hasMore: boolean
  hasPrev: boolean
  pageSize: number
  pageSizeOptions: number[]
  onNext: () => void
  onPrev: () => void
  onPageSizeChange: (size: number) => void
}

export function ListPagination({
  hasMore,
  hasPrev,
  pageSize,
  pageSizeOptions,
  onNext,
  onPrev,
  onPageSizeChange,
}: ListPaginationProps) {
  if (!hasMore && !hasPrev && pageSizeOptions.length <= 1) return null

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
        <span>每页</span>
        <Select
          value={String(pageSize)}
          onValueChange={(v) => onPageSizeChange(Number(v))}
        >
          <SelectTrigger className="h-7 w-16 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map((size) => (
              <SelectItem key={size} value={String(size)} className="text-xs">
                {size}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span>条</span>
      </div>

      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" onClick={onPrev} disabled={!hasPrev}>
          <ChevronLeft className="h-4 w-4" />
          上一页
        </Button>
        <Button variant="outline" size="sm" onClick={onNext} disabled={!hasMore}>
          下一页
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
