'use client'

import { useState } from 'react'

import { ScrollArea } from '../../../../shared/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../shared/components/ui/tabs'
import type { Log } from '@xartifact/x-llm-gateway-shared'

import { LogSheetStatusBar } from './log-sheet-status-bar'
import { LogSheetToolbar } from './log-sheet-toolbar'
import { MetadataBasicSections } from './metadata-basic-sections'
import { MetadataPerformanceSections } from './metadata-performance-sections'
import { MetadataRequestSections } from './metadata-request-sections'
import { RequestPanel } from './request-panel'
import { ResponsePanel } from './response-panel'
import { extractContentFeatures } from './extract-content-features'
import { ConversationTraceSheet } from '../conversation-trace-sheet'

interface LogDetailContentProps {
  log: Log
  onClose: () => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
  resolveClientType?: (clientType: string) => string
}

/**
 * Log detail content rendered directly in a page (not inside a Sheet overlay).
 * Extracted from LogDetailSheet to avoid z-50 overlay + black backdrop issues.
 */
export function LogDetailContent({
  log,
  onClose,
  formatDuration,
  formatTokens,
  resolveClientType,
}: LogDetailContentProps) {
  const [traceOpen, setTraceOpen] = useState(false)

  const isSuccess = log.status === 'success'
  const isPending = log.status === 'pending'
  const contentFeatures = extractContentFeatures(log)

  const metadataColumn = (
    <>
      <MetadataBasicSections log={log} isPending={isPending} isSuccess={isSuccess} contentFeatures={contentFeatures} onOpenTrace={log.conversationId ? () => setTraceOpen(true) : undefined} />
      <MetadataRequestSections log={log} resolveClientType={resolveClientType} />
      <MetadataPerformanceSections log={log} contentFeatures={contentFeatures} formatDuration={formatDuration} formatTokens={formatTokens} />
    </>
  )

  return (
    <>
      <div className="flex flex-col gap-0 border rounded-lg overflow-hidden h-[calc(100vh-120px)]">
        <LogSheetToolbar
          log={log}
          onClose={onClose}
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
              <TabsContent value="request" className="flex-1 m-0 overflow-hidden"><RequestPanel log={log} className="h-full border-r-0" /></TabsContent>
              <TabsContent value="response" className="flex-1 m-0 overflow-hidden"><ResponsePanel log={log} className="h-full border-r-0" /></TabsContent>
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
            <TabsContent value="overview" className="flex-1 m-0 overflow-hidden"><ScrollArea className="h-full">{metadataColumn}</ScrollArea></TabsContent>
            <TabsContent value="request" className="flex-1 m-0 overflow-hidden"><RequestPanel log={log} className="h-full border-r-0" /></TabsContent>
            <TabsContent value="response" className="flex-1 m-0 overflow-hidden"><ResponsePanel log={log} className="h-full border-r-0" /></TabsContent>
          </Tabs>
        </div>

        <LogSheetStatusBar log={log} formatDuration={formatDuration} formatTokens={formatTokens} />
      </div>

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
