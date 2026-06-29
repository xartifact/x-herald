'use client'

import { useState } from 'react'
import { z } from 'zod'

import { HeadersViewer } from '../../../../shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../shared/components/ui/tabs'
import { cn } from '../../../../shared/lib/utils'
import type { Log } from '@xartifact/x-llm-gateway-shared'

import { BodySubTabs } from './body-sub-tabs'
import { MessageAnalysisPanel } from './message-analysis-panel'
import { MessageTimelineSection } from './message-timeline-section'

const RequestBodySchema = z.object({
  messages: z.array(z.object({
    role: z.string(),
    content: z.unknown(),
  })).optional(),
})

interface RequestPanelProps {
  log: Log
  className?: string
}

export function RequestPanel({ log, className }: RequestPanelProps) {
  const hasMessageSequence = !!log.metadata?.messageSequence
  const [selectedMessageIndices, setSelectedMessageIndices] = useState<number[]>([])

  const parsed = RequestBodySchema.safeParse(log.requestBody)
  const messages = parsed.success ? parsed.data.messages : undefined

  const tabCount = hasMessageSequence ? 3 : 2

  return (
    <div className={cn('flex flex-col border-r last:border-r-0 bg-background overflow-hidden', className)}>
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          <h3 className="font-semibold text-sm">Request</h3>
        </div>
      </div>
      <Tabs defaultValue="body" className="flex flex-col flex-1 min-h-0">
        <div className="px-4 pt-3 pb-2 border-b bg-muted/10 flex-shrink-0">
          <TabsList className={cn('grid w-full', tabCount === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="headers">Headers</TabsTrigger>
            {hasMessageSequence && (
              <TabsTrigger value="analysis">消息分析</TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="body" className="flex-1 m-0 flex flex-col min-h-0">
          <BodySubTabs
            tabs={[
              { key: 'client', label: '客户端', data: log.requestBody, emptyText: '无客户端请求数据' },
              { key: 'provider', label: 'Provider', data: log.transformedRequestBody ?? null, emptyText: '无 Provider 请求数据' },
              { key: 'standard', label: '标准格式', data: log.standardRequestBody ?? null, emptyText: '无标准格式请求数据' },
            ]}
          />
        </TabsContent>

        <TabsContent value="headers" className="flex-1 m-0 overflow-auto">
          <div className="p-4">
            <Tabs defaultValue="client-headers" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="client-headers">客户端请求头</TabsTrigger>
                <TabsTrigger value="provider-headers">Provider 请求头</TabsTrigger>
              </TabsList>
              <TabsContent value="client-headers">
                {log.requestHeaders ? (
                  <HeadersViewer headers={log.requestHeaders} />
                ) : (
                  <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground">
                    无客户端请求头数据
                  </div>
                )}
              </TabsContent>
              <TabsContent value="provider-headers">
                {log.providerRequestHeaders ? (
                  <HeadersViewer headers={log.providerRequestHeaders} />
                ) : (
                  <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground">
                    无 Provider 请求头数据
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>

        {hasMessageSequence && (
          <TabsContent value="analysis" className="flex-1 m-0 overflow-auto">
            <MessageAnalysisPanel logId={log.id} selectedIndices={selectedMessageIndices} />
            <MessageTimelineSection
              messageSequence={log.metadata!.messageSequence!}
              messages={messages}
              selectedIndices={selectedMessageIndices}
              onSelectionChange={setSelectedMessageIndices}
            />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
