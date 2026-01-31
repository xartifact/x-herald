'use client'

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { JsonViewer, HeadersViewer } from '@/components/admin/JsonViewer'
import type { Log } from '@/hooks/use-logs'

interface LogDetailSheetProps {
  log?: Log | null
  open: boolean
  onOpenChange: (open: boolean) => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

export function LogDetailSheet({
  log,
  open,
  onOpenChange,
  formatDuration,
  formatTokens,
}: LogDetailSheetProps) {
  if (!log) return null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-[90vw] p-0 flex flex-col">
        <SheetHeader className="px-6 py-4 border-b">
          <SheetTitle>日志详情</SheetTitle>
          <SheetDescription>
            {log.modelName} - {new Date(log.createdAt).toLocaleString('zh-CN')}
          </SheetDescription>
        </SheetHeader>

        <div className="flex-1 flex flex-col overflow-hidden">
          <div className="px-6 py-3 border-b bg-muted/30">
            <div className="grid grid-cols-4 gap-3 text-xs">
              <div>
                <span className="text-muted-foreground">模型:</span>{' '}
                <span className="font-medium">{log.modelName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">供应商:</span>{' '}
                <span className="font-medium">{log.providerName || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">虚拟密钥:</span>{' '}
                <span className="font-medium">{log.virtualKeyName || '-'}</span>
              </div>
              <div>
                <span className="text-muted-foreground">状态:</span>{' '}
                <Badge variant={log.status === 'success' ? 'default' : 'destructive'} className="ml-1">
                  {log.status}
                </Badge>
                {log.statusCode && (
                  <span className="ml-1 text-muted-foreground">({log.statusCode})</span>
                )}
              </div>
              <div>
                <span className="text-muted-foreground">延迟:</span>{' '}
                <span className="font-medium">{formatDuration(log.latencyMs)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">流式:</span>{' '}
                <span className="font-medium">{log.streaming ? '是' : '否'}</span>
              </div>
              <div className="col-span-2">
                <span className="text-muted-foreground">Token:</span>{' '}
                <span className="font-medium">
                  ↑{formatTokens(log.inputTokens)} ↓{formatTokens(log.outputTokens)} =
                  {formatTokens(log.totalTokens)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs mt-2 pt-2 border-t">
              <div>
                <span className="text-muted-foreground">方法:</span>{' '}
                <span className="font-mono">{log.requestMethod || '-'}</span>
                {' | '}
                <span className="text-muted-foreground">IP:</span>{' '}
                <span className="font-mono">{log.clientIp || '-'}</span>
              </div>
              <div className="truncate">
                <span className="text-muted-foreground">路径:</span>{' '}
                <span className="font-mono text-xs" title={log.requestPath || '-'}>
                  {log.requestPath || '-'}
                </span>
              </div>
            </div>

            {log.errorMessage && (
              <div className="mt-2 pt-2 border-t">
                <div className="bg-destructive/10 p-2 rounded text-xs">
                  <div className="font-medium text-destructive">错误: {log.errorMessage}</div>
                  {log.errorType && (
                    <div className="text-muted-foreground mt-1">类型: {log.errorType}</div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 grid grid-cols-2 divide-x overflow-hidden">
            <div className="flex flex-col overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b">
                <h3 className="font-semibold text-sm">请求 (Request)</h3>
              </div>
              <ScrollArea className="flex-1">
                <Tabs defaultValue="body" className="p-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="headers">Headers</TabsTrigger>
                    <TabsTrigger value="body">Body</TabsTrigger>
                  </TabsList>

                  <TabsContent value="headers" className="mt-4">
                    <div className="border rounded-md p-3 max-h-[calc(100vh-400px)] overflow-y-auto">
                      <HeadersViewer headers={log.requestHeaders} />
                    </div>
                  </TabsContent>

                  <TabsContent value="body" className="mt-4">
                    {log.requestBody !== null && log.requestBody !== undefined ? (
                      <JsonViewer data={log.requestBody} height="calc(100vh - 400px)" />
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-12 border rounded-md">
                        无请求体
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </ScrollArea>
            </div>

            <div className="flex flex-col overflow-hidden">
              <div className="px-4 py-2 bg-muted/50 border-b">
                <h3 className="font-semibold text-sm">响应 (Response)</h3>
              </div>
              <ScrollArea className="flex-1">
                <Tabs defaultValue="body" className="p-4">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="headers">Headers</TabsTrigger>
                    <TabsTrigger value="body">Body</TabsTrigger>
                  </TabsList>

                  <TabsContent value="headers" className="mt-4">
                    <div className="border rounded-md p-3 max-h-[calc(100vh-400px)] overflow-y-auto">
                      <HeadersViewer headers={log.responseHeaders} />
                    </div>
                  </TabsContent>

                  <TabsContent value="body" className="mt-4">
                    {log.responseBody !== null && log.responseBody !== undefined ? (
                      <JsonViewer data={log.responseBody} height="calc(100vh - 400px)" />
                    ) : (
                      <div className="text-sm text-muted-foreground text-center py-12 border rounded-md">
                        无响应体
                      </div>
                    )}
                  </TabsContent>
                </Tabs>
              </ScrollArea>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
