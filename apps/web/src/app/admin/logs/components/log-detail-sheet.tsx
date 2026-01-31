'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Button } from '@/components/ui/button'
import {
  Copy,
  Check,
  Clock,
  Zap,
  Server,
  Key,
  Activity,
  AlertCircle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  ChevronDown,
  ChevronRight
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

interface MetricCardProps {
  icon: React.ReactNode
  label: string
  value: string | React.ReactNode
  subValue?: string
  variant?: 'default' | 'success' | 'error' | 'warning'
  className?: string
}

function MetricCard({ icon, label, value, subValue, variant = 'default', className }: MetricCardProps) {
  const variants = {
    default: 'border-border/50 bg-card/30',
    success: 'border-green-500/30 bg-green-500/5',
    error: 'border-red-500/30 bg-red-500/5',
    warning: 'border-amber-500/30 bg-amber-500/5',
  }

  return (
    <div className={cn(
      'relative overflow-hidden rounded-lg border backdrop-blur-sm transition-all hover:border-primary/50',
      variants[variant],
      className
    )}>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-1">
          <div className="text-muted-foreground">{icon}</div>
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
        </div>
        <div className="font-mono text-lg font-bold leading-none">{value}</div>
        {subValue && (
          <div className="text-xs text-muted-foreground mt-1 font-mono">{subValue}</div>
        )}
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
    </div>
  )
}

interface CollapsibleSectionProps {
  title: string
  children: React.ReactNode
  defaultOpen?: boolean
}

function CollapsibleSection({ title, children, defaultOpen = false }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-border/50 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-accent/50 transition-colors"
      >
        <span className="text-sm font-semibold">{title}</span>
        {isOpen ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
      </button>
      {isOpen && <div className="px-4 pb-4">{children}</div>}
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
  const [copiedField, setCopiedField] = useState<string | null>(null)

  if (!log) return null

  const isSuccess = log.status === 'success'
  const statusVariant = isSuccess ? 'success' : 'error'

  const handleCopy = (text: string, field: string) => {
    navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  const CopyButton = ({ text, field }: { text: string; field: string }) => (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => handleCopy(text, field)}
      className="h-6 px-2 text-xs"
    >
      {copiedField === field ? (
        <>
          <Check className="h-3 w-3 mr-1" />
          已复制
        </>
      ) : (
        <>
          <Copy className="h-3 w-3 mr-1" />
          复制
        </>
      )}
    </Button>
  )

  const latencyColor = log.latencyMs < 1000 ? 'text-green-500' : log.latencyMs < 3000 ? 'text-amber-500' : 'text-red-500'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-[95vw] p-0 flex flex-col bg-background/95 backdrop-blur-xl"
      >
        {/* 头部 - 紧凑且信息密集 */}
        <SheetHeader className="px-6 py-4 border-b border-border/50 bg-gradient-to-b from-background to-muted/20">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "flex items-center gap-2 px-3 py-1.5 rounded-md font-mono text-sm font-bold",
                  isSuccess ? "bg-green-500/10 text-green-500" : "bg-red-500/10 text-red-500"
                )}>
                  {isSuccess ? (
                    <CheckCircle className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  {log.status.toUpperCase()}
                  {log.statusCode && (
                    <span className="ml-2 opacity-70">{log.statusCode}</span>
                  )}
                </div>
                <Badge variant="outline" className="font-mono">
                  {log.requestMethod || 'UNKNOWN'}
                </Badge>
              </div>
              <div className="font-mono text-2xl font-bold tracking-tight">
                {log.modelName}
              </div>
              <div className="text-xs text-muted-foreground font-mono">
                {new Date(log.createdAt).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                  fractionalSecondDigits: 3,
                })}
              </div>
            </div>
          </div>
        </SheetHeader>

        {/* 关键指标网格 */}
        <div className="px-6 py-4 border-b border-border/50 bg-muted/30">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard
              icon={<Clock className="h-4 w-4" />}
              label="延迟"
              value={<span className={latencyColor}>{formatDuration(log.latencyMs)}</span>}
              variant={log.latencyMs < 1000 ? 'success' : log.latencyMs < 3000 ? 'warning' : 'error'}
            />

            <MetricCard
              icon={<Activity className="h-4 w-4" />}
              label="Token 使用"
              value={formatTokens(log.totalTokens)}
              subValue={`↑${formatTokens(log.inputTokens)} ↓${formatTokens(log.outputTokens)}`}
            />

            <MetricCard
              icon={<Server className="h-4 w-4" />}
              label="供应商"
              value={log.providerName || '-'}
              subValue={log.streaming ? '流式传输' : '普通请求'}
            />

            <MetricCard
              icon={<Key className="h-4 w-4" />}
              label="虚拟密钥"
              value={
                <span className="truncate block" title={log.virtualKeyName || '-'}>
                  {log.virtualKeyName || '-'}
                </span>
              }
            />
          </div>
        </div>

        {/* 元数据部分 */}
        <div className="border-b border-border/50 bg-card/20">
          <CollapsibleSection title="请求元数据" defaultOpen={false}>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-[120px_1fr] gap-x-4 gap-y-2 font-mono">
                <div className="text-muted-foreground">请求路径</div>
                <div className="flex items-center justify-between group">
                  <code className="text-xs break-all bg-muted/50 px-2 py-1 rounded">
                    {log.requestPath || '-'}
                  </code>
                  {log.requestPath && (
                    <CopyButton text={log.requestPath} field="path" />
                  )}
                </div>

                <div className="text-muted-foreground">客户端 IP</div>
                <div className="flex items-center justify-between group">
                  <code className="text-xs bg-muted/50 px-2 py-1 rounded">
                    {log.clientIp || '-'}
                  </code>
                  {log.clientIp && (
                    <CopyButton text={log.clientIp} field="ip" />
                  )}
                </div>

                <div className="text-muted-foreground">请求 ID</div>
                <div className="flex items-center justify-between group">
                  <code className="text-xs break-all bg-muted/50 px-2 py-1 rounded">
                    {log.id}
                  </code>
                  <CopyButton text={log.id} field="id" />
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {log.errorMessage && (
            <CollapsibleSection title="错误详情" defaultOpen={true}>
              <div className="space-y-3">
                <div className="p-4 rounded-lg border-2 border-red-500/30 bg-red-500/5">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 space-y-2">
                      <div className="font-medium text-red-500">
                        {log.errorMessage}
                      </div>
                      {log.errorType && (
                        <div className="text-xs text-muted-foreground font-mono">
                          类型: {log.errorType}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CollapsibleSection>
          )}
        </div>

        {/* 请求/响应主体 - 并排布局 */}
        <div className="flex-1 grid grid-cols-2 divide-x divide-border/50 overflow-hidden">
          {/* 请求面板 */}
          <div className="flex flex-col overflow-hidden bg-gradient-to-br from-blue-500/5 to-transparent">
            <div className="px-4 py-3 border-b border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <ArrowUpRight className="h-4 w-4 text-blue-500" />
                <h3 className="font-semibold text-sm">请求 (Request)</h3>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <Tabs defaultValue="body" className="p-4">
                <TabsList className="grid w-full grid-cols-2 bg-muted/50">
                  <TabsTrigger value="headers">Headers</TabsTrigger>
                  <TabsTrigger value="body">Body</TabsTrigger>
                </TabsList>

                <TabsContent value="headers" className="mt-4">
                  <div className="rounded-lg border border-border/50 bg-card/30 p-4">
                    <HeadersViewer headers={log.requestHeaders} />
                  </div>
                </TabsContent>

                <TabsContent value="body" className="mt-4">
                  {log.requestBody !== null && log.requestBody !== undefined ? (
                    <JsonViewer data={log.requestBody} height="calc(100vh - 450px)" />
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-12 border border-dashed rounded-lg">
                      无请求体
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </ScrollArea>
          </div>

          {/* 响应面板 */}
          <div className="flex flex-col overflow-hidden bg-gradient-to-br from-green-500/5 to-transparent">
            <div className="px-4 py-3 border-b border-border/50 bg-card/50 backdrop-blur-sm">
              <div className="flex items-center gap-2">
                <ArrowDownRight className="h-4 w-4 text-green-500" />
                <h3 className="font-semibold text-sm">响应 (Response)</h3>
              </div>
            </div>
            <ScrollArea className="flex-1">
              <Tabs defaultValue="body" className="p-4">
                <TabsList className="grid w-full grid-cols-2 bg-muted/50">
                  <TabsTrigger value="headers">Headers</TabsTrigger>
                  <TabsTrigger value="body">Body</TabsTrigger>
                </TabsList>

                <TabsContent value="headers" className="mt-4">
                  <div className="rounded-lg border border-border/50 bg-card/30 p-4">
                    <HeadersViewer headers={log.responseHeaders} />
                  </div>
                </TabsContent>

                <TabsContent value="body" className="mt-4">
                  {log.responseBody !== null && log.responseBody !== undefined ? (
                    <JsonViewer data={log.responseBody} height="calc(100vh - 450px)" />
                  ) : (
                    <div className="text-sm text-muted-foreground text-center py-12 border border-dashed rounded-lg">
                      无响应体
                    </div>
                  )}
                </TabsContent>
              </Tabs>
            </ScrollArea>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
