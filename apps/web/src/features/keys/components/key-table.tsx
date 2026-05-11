'use client'

import { Pencil, Trash2, RefreshCw, BarChart2 } from 'lucide-react'

import type { KeyStat } from '@/hooks/use-logs'
import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { Card, CardContent } from '@/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/ui/table'

import { KeyDisplay } from './key-display'
import type { VirtualKey } from '../types'

interface KeyTableProps {
  keys: VirtualKey[]
  showKeyValue: Record<string, boolean>
  copiedKey: string | null
  statsMap: Map<string, KeyStat>
  onToggleShow: (keyId: string) => void
  onCopy: (keyValue: string, keyId: string) => void
  onEdit: (keyId: string) => void
  onDelete: (keyId: string, name: string) => void
  onReset: (keyId: string) => void
  onShowStats: (keyId: string) => void
  formatDate: (dateStr: string | null) => string
}

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return '从未使用'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  if (diff < 2_592_000_000) return `${Math.floor(diff / 86_400_000)} 天前`
  return new Date(dateStr).toLocaleDateString('zh-CN')
}

function formatTokensCompact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
  return String(n)
}

export function KeyTable({
  keys,
  showKeyValue,
  copiedKey,
  statsMap,
  onToggleShow,
  onCopy,
  onEdit,
  onDelete,
  onReset,
  onShowStats,
  formatDate,
}: KeyTableProps) {
  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>名称</TableHead>
              <TableHead>API 密钥</TableHead>
              <TableHead>最近使用</TableHead>
              <TableHead>用量</TableHead>
              <TableHead>限制</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>过期时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {keys.map((key) => {
              const stat = statsMap.get(key.id)
              return (
              <TableRow key={key.id}>
                <TableCell>
                  <div className="font-medium">{key.name}</div>
                </TableCell>
                <TableCell>
                  <KeyDisplay
                    keyValue={key.key}
                    showKey={showKeyValue[key.id]}
                    copied={copiedKey === key.id}
                    onToggleShow={() => onToggleShow(key.id)}
                    onCopy={() => onCopy(key.key, key.id)}
                  />
                </TableCell>
                <TableCell>
                  <span className="text-sm text-muted-foreground">
                    {formatRelativeTime(stat?.lastUsedAt ?? null)}
                  </span>
                </TableCell>
                <TableCell>
                  {stat ? (
                    <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                      <span>{stat.requestCount.toLocaleString()} 次</span>
                      <span>{formatTokensCompact(stat.totalTokens)} tokens</span>
                    </div>
                  ) : (
                    <span className="text-xs text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex flex-col gap-1 text-xs">
                    {key.rateLimitRpm && (
                      <span className="text-muted-foreground">{key.rateLimitRpm} RPM</span>
                    )}
                    {key.rateLimitRpd && (
                      <span className="text-muted-foreground">{key.rateLimitRpd} RPD</span>
                    )}
                    {key.tokenLimitDaily && (
                      <span className="text-muted-foreground">
                        {Number(key.tokenLimitDaily).toLocaleString()} tokens/天
                      </span>
                    )}
                    {!key.rateLimitRpm && !key.rateLimitRpd && !key.tokenLimitDaily && (
                      <span className="text-muted-foreground">无限制</span>
                    )}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant={key.enabled ? 'default' : 'destructive'}>
                    {key.enabled ? '启用' : '禁用'}
                  </Badge>
                </TableCell>
                <TableCell>
                  <span className={`text-sm ${key.expiresAt && new Date(key.expiresAt) < new Date() ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {formatDate(key.expiresAt)}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" title="查看用量统计" onClick={() => onShowStats(key.id)}>
                      <BarChart2 className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onReset(key.id)} title="重置密钥">
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onEdit(key.id)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => onDelete(key.id, key.name)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            )})}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
