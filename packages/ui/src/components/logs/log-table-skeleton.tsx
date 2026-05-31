'use client'

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table'

export function LogTableSkeleton() {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[80px]">状态</TableHead>
            <TableHead>模型</TableHead>
            <TableHead className="w-[100px]">响应时间</TableHead>
            <TableHead className="w-[120px]">Token</TableHead>
            <TableHead className="w-[120px]">虚拟密钥</TableHead>
            <TableHead className="w-[100px]">客户端</TableHead>
            <TableHead className="w-[200px]">Endpoint</TableHead>
            <TableHead className="w-[160px]">时间</TableHead>
            <TableHead className="w-[100px]">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 8 }).map((_, i) => (
            <TableRow key={i}>
              <TableCell>
                <div className="h-4 w-8 animate-pulse rounded bg-gray-200" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-20 animate-pulse rounded bg-gray-200" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-full animate-pulse rounded bg-gray-200" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-24 animate-pulse rounded bg-gray-200" />
              </TableCell>
              <TableCell>
                <div className="h-4 w-16 animate-pulse rounded bg-gray-200" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
