'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Copy,
  Check,
  X,
  ExternalLink,
  ChevronRight,
} from 'lucide-react'
import { JsonViewer, HeadersViewer } from '@/components/admin/JsonViewer'
import { cn } from '@/core/lib/utils'
import type { Log } from '@/hooks/use-logs'

interface LogDetailSheetProps {
  log?: Log | null
  open: boolean
  onOpenChange: (open: boolean) => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

interface InfoRowProps {
  label: string
  value: string | React.ReactNode
  copyable?: boolean
  mono?: boolean
}

function InfoRow({ label, value, copyable = false, mono = false }: InfoRowProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (typeof value === 'string') {
      navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-start py-2.5 px-4 hover:bg-accent/50 transition-colors group">
      <div className="w-32 flex-shrink-0 text-sm text-muted-foreground font-medium">
        {label}
      </div>
      <div className={cn(
        "flex-1 text-sm",
        mono && "font-mono"
      )}>
        {value}
      </div>
      {copyable && typeof value === 'string' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
  badge?: React.ReactNode
  action?: React.ReactNode
}

function Section({ title, children, badge, action }: SectionProps) {
  return (
    <div className="border-b last:border-b-0">
      <div className="px-4 py-2.5 bg-muted/30 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {badge}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  )
}

interface PanelProps {
  title: string
  icon?: React.ReactNode
  bodyContent: React.ReactNode
  transformedContent?: React.ReactNode
  headers: Record<string, string> | null
  className?: string
}

function Panel({ title, icon, bodyContent, transformedContent, headers, className }: PanelProps) {
  const [activeTab, setActiveTab] = useState<'body' | 'transformed' | 'headers'>('body')
  const hasTransformed = transformedContent !== undefined

  return (
    <div className={cn("flex flex-col border-r last:border-r-0 bg-background", className)}>
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === 'body' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('body')}
            className="h-7 px-3 text-xs"
          >
            Body
          </Button>
          {hasTransformed && (
            <Button
              variant={activeTab === 'transformed' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('transformed')}
              className="h-7 px-3 text-xs"
            >
              Transformed
            </Button>
          )}
          <Button
            variant={activeTab === 'headers' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('headers')}
            className="h-7 px-3 text-xs"
          >
            Headers
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {activeTab === 'body' && bodyContent}
        {activeTab === 'transformed' && transformedContent}
        {activeTab === 'headers' && (
          <div className="p-4">
            <HeadersViewer headers={headers} />
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

export function LogDetailSheet({
  log,
  open,
  onOpenChange,
  formatDuration,
  formatTokens,
}: LogDetailSheetProps) {
  if (!log) return null

  const isSuccess = log.status === 'success'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[66vw] max-w-[66vw] p-0 flex flex-col gap-0 sm:max-w-[66vw]"
      >
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b bg-background">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {isSuccess ? (
                <div className="h-2 w-2 rounded-full bg-green-500" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-red-500" />
              )}
              <span className="text-sm font-semibold">
                {log.requestMethod || 'REQUEST'}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{log.modelName}</span>
            </div>
            <Badge variant={isSuccess ? 'default' : 'destructive'} className="font-mono text-xs">
              {log.statusCode || log.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              {new Date(log.createdAt).toLocaleString('zh-CN')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 主体三栏布局 */}
        <div className="flex-1 grid grid-cols-[minmax(400px,30%)_1fr_1fr] overflow-hidden">
          {/* 左侧面板：元数据 */}
          <div className="flex flex-col border-r bg-muted/20 overflow-hidden">
            <ScrollArea className="flex-1">
              <Section title="基本信息">
                <InfoRow
                  label="状态"
                  value={
                    <div className="flex items-center gap-2">
                      <span className={isSuccess ? 'text-green-600' : 'text-red-600'}>
                        {isSuccess ? '成功' : '失败'}
                      </span>
                      {log.statusCode && (
                        <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                          {log.statusCode}
                        </code>
                      )}
                    </div>
                  }
                />
                <InfoRow
                  label="模型"
                  value={log.modelName}
                  mono
                />
                <InfoRow
                  label="供应商"
                  value={log.providerName || '-'}
                />
                {log.providerId && (
                  <InfoRow
                    label="供应商ID"
                    value={log.providerId}
                    copyable
                    mono
                  />
                )}
                <InfoRow
                  label="虚拟密钥"
                  value={log.virtualKeyName || '-'}
                  copyable
                  mono
                />
                {log.virtualKeyId && (
                  <InfoRow
                    label="密钥ID"
                    value={log.virtualKeyId}
                    copyable
                    mono
                  />
                )}
                {log.incomingProtocol && log.targetProtocol && (
                  <InfoRow
                    label="协议转换"
                    value={
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {log.incomingProtocol}
                        </Badge>
                        <ChevronRight className="h-3 w-3 text-muted-foreground" />
                        <Badge variant="outline" className="text-[10px] font-mono">
                          {log.targetProtocol}
                        </Badge>
                      </div>
                    }
                  />
                )}
              </Section>

              <Section title="性能指标">
                <InfoRow
                  label="延迟"
                  value={
                    <span className={cn(
                      "font-semibold",
                      log.latencyMs < 1000 ? "text-green-600" :
                      log.latencyMs < 3000 ? "text-amber-600" :
                      "text-red-600"
                    )}>
                      {formatDuration(log.latencyMs)}
                    </span>
                  }
                />
                <InfoRow
                  label="流式传输"
                  value={log.streaming ? '是' : '否'}
                />
                <InfoRow
                  label="输入 Token"
                  value={formatTokens(log.inputTokens)}
                  mono
                />
                <InfoRow
                  label="输出 Token"
                  value={formatTokens(log.outputTokens)}
                  mono
                />
                <InfoRow
                  label="总 Token"
                  value={
                    <span className="font-semibold">
                      {formatTokens(log.totalTokens)}
                    </span>
                  }
                  mono
                />
              </Section>

              <Section title="请求信息">
                <InfoRow
                  label="方法"
                  value={log.requestMethod || '-'}
                  mono
                />
                <InfoRow
                  label="路径"
                  value={
                    <span className="text-xs break-all">
                      {log.requestPath || '-'}
                    </span>
                  }
                  copyable
                  mono
                />
                <InfoRow
                  label="客户端 IP"
                  value={log.clientIp || '-'}
                  copyable
                  mono
                />
                <InfoRow
                  label="User Agent"
                  value={
                    <span className="text-xs break-all">
                      {log.userAgent || '-'}
                    </span>
                  }
                  mono
                />
                <InfoRow
                  label="请求 ID"
                  value={
                    <span className="text-xs break-all">
                      {log.id}
                    </span>
                  }
                  copyable
                  mono
                />
              </Section>

              {log.errorMessage && (
                <Section
                  title="错误详情"
                  badge={
                    <Badge variant="destructive" className="text-xs">
                      Error
                    </Badge>
                  }
                >
                  <div className="p-4 space-y-2">
                    <div className="text-sm font-medium text-red-600">
                      {log.errorMessage}
                    </div>
                    {log.errorType && (
                      <div className="text-xs text-muted-foreground font-mono">
                        类型: {log.errorType}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              <Section title="时间戳">
                <InfoRow
                  label="创建时间"
                  value={new Date(log.createdAt).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  mono
                />
              </Section>
            </ScrollArea>
          </div>

          {/* 中间面板：请求 */}
          <Panel
            title="Request"
            icon={<div className="h-1.5 w-1.5 rounded-full bg-blue-500" />}
            headers={log.requestHeaders}
            bodyContent={
              <div className="p-4">
                {log.requestBody !== null && log.requestBody !== undefined ? (
                  <JsonViewer data={log.requestBody} height="calc(100vh - 200px)" />
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    无请求体
                  </div>
                )}
              </div>
            }
            transformedContent={
              <div className="p-4">
                {log.transformedRequestBody !== null && log.transformedRequestBody !== undefined ? (
                  <JsonViewer data={log.transformedRequestBody} height="calc(100vh - 200px)" />
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    无转换后请求体
                  </div>
                )}
              </div>
            }
          />

          {/* 右侧面板：响应 */}
          <Panel
            title="Response"
            icon={<div className="h-1.5 w-1.5 rounded-full bg-green-500" />}
            headers={log.responseHeaders}
            bodyContent={
              <div className="p-4">
                {log.responseBody !== null && log.responseBody !== undefined ? (
                  <JsonViewer data={log.responseBody} height="calc(100vh - 200px)" />
                ) : (
                  <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                    无响应体
                  </div>
                )}
              </div>
            }
          />
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-6 py-2 border-t bg-muted/20 text-xs text-muted-foreground font-mono">
          <div className="flex items-center gap-4">
            <span>延迟: {formatDuration(log.latencyMs)}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Token: {formatTokens(log.totalTokens)}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>{isSuccess ? '成功' : '失败'}</span>
          </div>
          <div className="flex items-center gap-2">
            <span>{new Date(log.createdAt).toLocaleTimeString('zh-CN')}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
