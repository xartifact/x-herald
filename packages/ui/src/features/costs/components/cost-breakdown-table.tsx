'use client'

import { useMemo } from 'react'

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '../../../shared/components/ui'
import type { CostBreakdownItem } from '../hooks'

interface CostBreakdownTableProps {
  items: CostBreakdownItem[]
  totalCost: number
  isLoading?: boolean
}

function formatCurrency(value: number): string {
  return `$${value.toFixed(2)}`
}

function formatTokens(tokens: number): string {
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(1)}M`
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(1)}K`
  return tokens.toLocaleString()
}

export function CostBreakdownTable({ items, totalCost, isLoading }: CostBreakdownTableProps) {
  const sortedItems = useMemo(() => {
    return [...items].toSorted((a, b) => b.totalCost - a.totalCost)
  }, [items])

  if (isLoading) {
    return (
      <div className="space-y-2">
        {SKELETON_ROWS.map((key) => (
          <div key={key} className="h-12 bg-muted animate-pulse rounded" />
        ))}
      </div>
    )
  }

  if (sortedItems.length === 0) {
    return <div className="text-center text-muted-foreground py-12">暂无数据</div>
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名称</TableHead>
            <TableHead className="text-right">请求数</TableHead>
            <TableHead className="text-right">输入 Token</TableHead>
            <TableHead className="text-right">输出 Token</TableHead>
            <TableHead className="text-right">总费用</TableHead>
            <TableHead className="text-right">占比</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedItems.map((item) => {
            const percentage = totalCost > 0 ? (item.totalCost / totalCost) * 100 : 0

            return (
              <TableRow key={item.name}>
                <TableCell className="font-medium">{item.name || '未命名'}</TableCell>
                <TableCell className="text-right">{item.requestCount.toLocaleString()}</TableCell>
                <TableCell className="text-right">{formatTokens(item.inputTokens)}</TableCell>
                <TableCell className="text-right">{formatTokens(item.outputTokens)}</TableCell>
                <TableCell className="text-right font-medium text-emerald-600">
                  {formatCurrency(item.totalCost)}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-xs text-muted-foreground w-10 text-right">
                      {percentage.toFixed(1)}%
                    </span>
                    <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 rounded-full"
                        style={{ width: `${Math.min(percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}
