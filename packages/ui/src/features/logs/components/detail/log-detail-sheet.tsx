import { useState } from 'react'

import { ScrollArea } from '../../../../shared/components/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '../../../../shared/components/ui/sheet'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../shared/components/ui/tabs'
import type { Log } from '@xartifact/x-herald-shared'

import { LogSheetStatusBar } from './log-sheet-status-bar'
import { LogSheetToolbar } from './log-sheet-toolbar'
import { MetadataBasicSections } from './metadata-basic-sections'
import { MetadataPerformanceSections } from './metadata-performance-sections'
import { MetadataRequestSections } from './metadata-request-sections'
import { RequestPanel } from './request-panel'
import { ResponsePanel } from './response-panel'
import { extractContentFeatures } from './extract-content-features'
import { ConversationTraceSheet } from '../conversation-trace-sheet'

interface LogDetailSheetProps {
  log: Log | null
  open: boolean
  onOpenChange: (open: boolean) => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
  resolveClientType?: (clientType: string) => string
}

export function LogDetailSheet({
  log,
  open,
  onOpenChange,
  formatDuration,
  formatTokens,
  resolveClientType,
}: LogDetailSheetProps) {
  const [traceOpen, setTraceOpen] = useState(false)

  if (!log) return null

  const isSuccess = log.status === 'success'
  const isPending = log.status === 'pending'
  const contentFeatures = extractContentFeatures(log)

  const metadataColumn = (
    <>
      <MetadataBasicSections
        log={log}
        isPending={isPending}
        isSuccess={isSuccess}
        contentFeatures={contentFeatures}
        onOpenTrace={log.conversationId ? () => setTraceOpen(true) : undefined}
      />
      <MetadataRequestSections log={log} resolveClientType={resolveClientType} />
      <MetadataPerformanceSections
        log={log}
        contentFeatures={contentFeatures}
        formatDuration={formatDuration}
        formatTokens={formatTokens}
      />
    </>
  )

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="w-full max-w-full md:w-[85vw] md:max-w-[85vw] 2xl:w-[70vw] 2xl:max-w-[70vw] p-0 flex flex-col gap-0"
          hideCloseButton
        >
          <SheetTitle className="sr-only">日志详情</SheetTitle>
          <SheetDescription className="sr-only">请求日志详细信息</SheetDescription>
          <LogSheetToolbar
            log={log}
            onClose={() => onOpenChange(false)}
            onOpenTrace={log.conversationId ? () => setTraceOpen(true) : undefined}
          />

          {/* Desktop: 3-column grid */}
          <div className="flex-1 hidden 2xl:grid grid-cols-[minmax(360px,30%)_1fr_1fr] overflow-hidden">
            <div className="flex flex-col border-r bg-muted/20 overflow-hidden">
              <ScrollArea className="flex-1">{metadataColumn}</ScrollArea>
            </div>
            <RequestPanel log={log} />
            <ResponsePanel log={log} />
          </div>

          {/* Tablet: left sidebar + right tabbed content */}
          <div className="flex-1 hidden md:grid 2xl:hidden grid-cols-[280px_1fr] overflow-hidden">
            <div className="flex flex-col border-r bg-muted/20 overflow-hidden">
              <ScrollArea className="flex-1">{metadataColumn}</ScrollArea>
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

          {/* Mobile: 3-tab (overview/request/response) */}
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
                <ScrollArea className="h-full">{metadataColumn}</ScrollArea>
              </TabsContent>
              <TabsContent value="request" className="flex-1 m-0 overflow-hidden">
                <RequestPanel log={log} className="h-full border-r-0" />
              </TabsContent>
              <TabsContent value="response" className="flex-1 m-0 overflow-hidden">
                <ResponsePanel log={log} className="h-full border-r-0" />
              </TabsContent>
            </Tabs>
          </div>

          <LogSheetStatusBar
            log={log}
            formatDuration={formatDuration}
            formatTokens={formatTokens}
          />
        </SheetContent>
      </Sheet>

      {log.conversationId && (
        <ConversationTraceSheet
          conversationId={log.conversationId}
          open={traceOpen}
          onOpenChange={setTraceOpen}
        />
      )}
    </>
  )
}
