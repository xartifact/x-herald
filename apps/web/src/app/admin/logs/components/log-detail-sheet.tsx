'use client'

import { ChevronRight, X } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/core/lib/utils'
import type { Log } from '@/hooks/use-logs'

import { MetadataBasicSections } from './metadata-basic-sections'
import { MetadataPerformanceSections } from './metadata-performance-sections'
import { MetadataRequestSections } from './metadata-request-sections'
import { RequestPanel } from './request-panel'
import { ResponsePanel } from './response-panel'
import { extractContentFeatures } from './utils/extract-content-features'

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

  const isSuccess = log.status === 'success'
  const isPending = log.status === 'pending'
  const contentFeatures = extractContentFeatures(log)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full max-w-full md:w-[85vw] md:max-w-[85vw] 2xl:w-[70vw] 2xl:max-w-[70vw] p-0 flex flex-col gap-0"
        hideCloseButton
      >
        <SheetTitle className="sr-only">日志详情</SheetTitle>
        <SheetDescription className="sr-only">请求日志详细信息</SheetDescription>
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-3 md:px-6 py-3 md:py-3.5 border-b bg-background">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <div className="flex items-center gap-1.5 md:gap-2 min-w-0">
              {isPending ? (
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse flex-shrink-0" />
              ) : isSuccess ? (
                <div className="h-2 w-2 rounded-full bg-green-500 flex-shrink-0" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-red-500 flex-shrink-0" />
              )}
              <span className="text-sm font-semibold hidden md:inline">
                {log.requestMethod || 'REQUEST'}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground hidden md:inline flex-shrink-0" />
              <span className="text-sm font-medium truncate">{log.modelName}</span>
            </div>
            <Badge
              variant={isPending ? 'outline' : isSuccess ? 'default' : 'destructive'}
              className={cn(
                "font-mono text-xs flex-shrink-0",
                isPending && "border-amber-500 text-amber-600"
              )}
            >
              {isPending ? "请求中" : log.statusCode || log.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs text-muted-foreground font-mono hidden md:inline">
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

        {/* 主体响应式布局: xl 三栏 / md 两栏 / sm 单栏 Tab */}
        {/* 大屏：三栏 grid */}
        <div className="flex-1 hidden 2xl:grid grid-cols-[minmax(360px,30%)_1fr_1fr] overflow-hidden">
          <div className="flex flex-col border-r bg-muted/20 overflow-hidden">
            <ScrollArea className="flex-1">
              <>
                <MetadataBasicSections log={log} isPending={isPending} isSuccess={isSuccess} contentFeatures={contentFeatures} />
                <MetadataRequestSections log={log} />
                <MetadataPerformanceSections log={log} isPending={isPending} isSuccess={isSuccess} contentFeatures={contentFeatures} formatDuration={formatDuration} formatTokens={formatTokens} />
              </>
            </ScrollArea>
          </div>

          <RequestPanel log={log} />
          <ResponsePanel log={log} />
        </div>

        {/* 中屏：两栏 (元数据 + 请求/响应 Tab) */}
        <div className="flex-1 hidden md:grid 2xl:hidden grid-cols-[280px_1fr] overflow-hidden">
          <div className="flex flex-col border-r bg-muted/20 overflow-hidden">
            <ScrollArea className="flex-1">
              <>
                <MetadataBasicSections log={log} isPending={isPending} isSuccess={isSuccess} contentFeatures={contentFeatures} />
                <MetadataRequestSections log={log} />
                <MetadataPerformanceSections log={log} isPending={isPending} isSuccess={isSuccess} contentFeatures={contentFeatures} formatDuration={formatDuration} formatTokens={formatTokens} />
              </>
            </ScrollArea>
          </div>
          <div className="flex flex-col overflow-hidden">
            <Tabs defaultValue="request" className="flex flex-col flex-1 overflow-hidden">
              <div className="px-4 py-2 border-b bg-muted/10 flex-shrink-0">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="request">Request</TabsTrigger>
                  <TabsTrigger value="response">Response</TabsTrigger>
                </TabsList>
              </div>
              <TabsContent value="request" className="flex-1 m-0 overflow-hidden">
                <RequestPanel log={log} className="h-full border-r-0" />
              </TabsContent>
              <TabsContent value="response" className="flex-1 m-0 overflow-hidden">
                <ResponsePanel log={log} className="h-full border-r-0" />
              </TabsContent>
            </Tabs>
          </div>
        </div>

        {/* 小屏：单栏 Tab */}
        <div className="flex-1 flex flex-col md:hidden overflow-hidden">
          <Tabs defaultValue="overview" className="flex flex-col flex-1 overflow-hidden">
            <div className="px-3 py-2 border-b bg-muted/10 flex-shrink-0">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="overview">概览</TabsTrigger>
                <TabsTrigger value="request">请求</TabsTrigger>
                <TabsTrigger value="response">响应</TabsTrigger>
              </TabsList>
            </div>
            <TabsContent value="overview" className="flex-1 m-0 overflow-hidden">
              <ScrollArea className="h-full">
                <>
<MetadataBasicSections log={log} isPending={isPending} isSuccess={isSuccess} contentFeatures={contentFeatures} />
                <MetadataRequestSections log={log} />
                <MetadataPerformanceSections log={log} isPending={isPending} isSuccess={isSuccess} contentFeatures={contentFeatures} formatDuration={formatDuration} formatTokens={formatTokens} />
                </>
              </ScrollArea>
            </TabsContent>
            <TabsContent value="request" className="flex-1 m-0 overflow-hidden">
              <RequestPanel log={log} className="h-full border-r-0" />
            </TabsContent>
            <TabsContent value="response" className="flex-1 m-0 overflow-hidden">
              <ResponsePanel log={log} className="h-full border-r-0" />
            </TabsContent>
          </Tabs>
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-3 md:px-6 py-2 border-t bg-muted/20 text-xs text-muted-foreground font-mono">
          <div className="flex items-center gap-2 md:gap-4">
            <span>响应时间: {formatDuration(log.responseTimeMs)}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Token: {formatTokens(log.totalTokens)}</span>
            <Separator orientation="vertical" className="h-4 hidden md:block" />
            <span className={cn("hidden md:inline", isPending ? 'text-amber-600' : isSuccess ? 'text-green-600' : 'text-red-600')}>
              {isPending ? '请求中' : isSuccess ? '成功' : '失败'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>{new Date(log.createdAt).toLocaleTimeString('zh-CN')}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
