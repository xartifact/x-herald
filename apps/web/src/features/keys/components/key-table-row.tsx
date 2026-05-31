'use client'

import { Pencil, Trash2, RefreshCw, BarChart2 } from 'lucide-react'

import type { KeyStat } from '@/hooks/use-logs'
import { Badge } from '@x-llm-gateway/ui'
import { Button } from '@x-llm-gateway/ui'
import { TableCell, TableRow } from '@x-llm-gateway/ui'

import { KeyDisplay } from './key-display'
import type { VirtualKey } from '@x-llm-gateway/engine'

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

export interface KeyRowDisplay {
  showKeyValue: Record<string, boolean>
  copiedKey: string | null
  onToggleShow: (keyId: string) => void
  onCopy: (keyValue: string, keyId: string) => void
}

export interface KeyRowActions {
  onEdit: (keyId: string) => void
  onDelete: (keyId: string, name: string) => void
  onReset: (keyId: string) => void
  onShowStats: (keyId: string) => void
}

interface KeyTableRowProps {
  virtualKey: VirtualKey
  stat: KeyStat | undefined
  display: KeyRowDisplay
  actions: KeyRowActions
  formatDate: (dateStr: string | null) => string
}

export function KeyTableRow({ virtualKey: key, stat, display, actions, formatDate }: KeyTableRowProps) {
  return (
    <TableRow>
      <TableCell><div className="font-medium">{key.name}</div></TableCell>
      <TableCell>
        <KeyDisplay
          keyValue={key.key} showKey={display.showKeyValue[key.id]} copied={display.copiedKey === key.id}
          onToggleShow={() => display.onToggleShow(key.id)} onCopy={() => display.onCopy(key.key, key.id)}
        />
      </TableCell>
      <TableCell><span className="text-sm text-muted-foreground">{formatRelativeTime(stat?.lastUsedAt ?? null)}</span></TableCell>
      <TableCell>
        {stat ? (
          <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
            <span>{stat.requestCount.toLocaleString()} 次</span>
            <span>{formatTokensCompact(stat.totalTokens)} tokens</span>
          </div>
        ) : <span className="text-xs text-muted-foreground">-</span>}
      </TableCell>
      <TableCell>
        <div className="flex flex-col gap-1 text-xs">
          {key.rateLimitRpm && <span className="text-muted-foreground">{key.rateLimitRpm} RPM</span>}
          {key.rateLimitRpd && <span className="text-muted-foreground">{key.rateLimitRpd} RPD</span>}
          {key.tokenLimitDaily && <span className="text-muted-foreground">{Number(key.tokenLimitDaily).toLocaleString()} tokens/天</span>}
          {!key.rateLimitRpm && !key.rateLimitRpd && !key.tokenLimitDaily && <span className="text-muted-foreground">无限制</span>}
        </div>
      </TableCell>
      <TableCell><Badge variant={key.enabled ? 'default' : 'destructive'}>{key.enabled ? '启用' : '禁用'}</Badge></TableCell>
      <TableCell>
        <span className={`text-sm ${key.expiresAt && new Date(key.expiresAt) < new Date() ? 'text-destructive' : 'text-muted-foreground'}`}>
          {formatDate(key.expiresAt instanceof Date ? key.expiresAt.toISOString() : key.expiresAt)}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" title="查看用量统计" onClick={() => actions.onShowStats(key.id)}><BarChart2 className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => actions.onReset(key.id)} title="重置密钥"><RefreshCw className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => actions.onEdit(key.id)}><Pencil className="h-4 w-4" /></Button>
          <Button variant="ghost" size="sm" onClick={() => actions.onDelete(key.id, key.name)}><Trash2 className="h-4 w-4" /></Button>
        </div>
      </TableCell>
    </TableRow>
  )
}
