'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface LogPaginationProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function LogPagination({ currentPage, totalPages, onPageChange }: LogPaginationProps) {
  if (totalPages <= 1) return null

  return (
    <div className="flex items-center justify-between px-4 py-3 border rounded-lg bg-muted/20">
      <div className="text-sm text-muted-foreground">
        第 {currentPage} / {totalPages} 页
      </div>
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
    </div>
  )
}
