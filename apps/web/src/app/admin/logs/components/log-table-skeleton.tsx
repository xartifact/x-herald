'use client'

import { Skeleton } from '@x-llm-gateway/ui'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@x-llm-gateway/ui'

export function LogTableSkeleton() {
  return (
    <div className="border rounded-lg">
      <Table>
        <TableHeader className="bg-muted/50">
          <TableRow className="hover:bg-muted/50">
            <TableHead className="w-[50px]">状态</TableHead>
            <TableHead className="min-w-[200px]">模型</TableHead>
            <TableHead className="w-[100px]">响应时间</TableHead>
            <TableHead className="w-[140px]">Token</TableHead>
            <TableHead className="min-w-[150px]">虚拟密钥</TableHead>
            <TableHead className="w-[120px]">客户端</TableHead>
            <TableHead className="w-[140px]">Endpoint</TableHead>
            <TableHead className="w-[160px]">时间</TableHead>
            <TableHead className="w-[120px] text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 10 }).map((_, i) => (
            <TableRow key={i} className="hover:bg-transparent">
              <TableCell>
                <Skeleton className="h-4 w-4 rounded-full" />
              </TableCell>
              <TableCell>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-40" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-12" />
              </TableCell>
              <TableCell>
                <div className="space-y-1">
                  <Skeleton className="h-3 w-10" />
                  <Skeleton className="h-3 w-10" />
                </div>
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-20" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-5 w-16 rounded-md" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-3 w-14" />
              </TableCell>
              <TableCell>
                <Skeleton className="h-4 w-24" />
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Skeleton className="h-7 w-7 rounded" />
                  <Skeleton className="h-7 w-7 rounded" />
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
