'use client'

import { useState } from 'react'

import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '../ui/button'
import { Input } from '../ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../ui/select'

export interface ListPaginationProps {
  currentPage: number
  totalPages: number
  pageSize: number
  pageSizeOptions: number[]
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

export function ListPagination({
  currentPage,
  totalPages,
  pageSize,
  pageSizeOptions,
  onPageChange,
  onPageSizeChange,
}: ListPaginationProps) {
  const [inputValue, setInputValue] = useState('')

  if (totalPages <= 1 && pageSizeOptions.length <= 1) return null

  const handleJump = () => {
    const page = parseInt(inputValue, 10)
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      onPageChange(page)
    }
    setInputValue('')
  }

  return (
    <div className="flex items-center justify-between py-1">
      <div className="flex items-center gap-3">
        <div className="text-sm text-muted-foreground">
          第 {currentPage} / {totalPages} 页
        </div>
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
      </div>

      {totalPages > 1 && (
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.max(1, currentPage - 1))}
            disabled={currentPage === 1}
          >
            <ChevronLeft className="h-4 w-4" />
            上一页
          </Button>
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span>跳至</span>
            <Input
              className="h-7 w-14 text-center px-1"
              value={inputValue}
              placeholder={String(currentPage)}
              onChange={(e) => setInputValue(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleJump()}
              onBlur={handleJump}
            />
            <span>页</span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
            disabled={currentPage === totalPages}
          >
            下一页
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  )
}
