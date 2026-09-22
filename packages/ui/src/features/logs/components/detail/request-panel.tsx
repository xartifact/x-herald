import { useState } from 'react'
import { z } from 'zod'

import { HeadersViewer } from '../../../../shared'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../../../shared/components/ui/tabs'
import { cn } from '../../../../shared/lib/utils'
import type { Log } from '@xartifact/x-herald-shared'

import { BodySubTabs } from './body-sub-tabs'
import { MessageAnalysisPanel } from './message-analysis-panel'
import { MessageTimelineSection } from './message-timeline-section'

const RequestBodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.string(),
        content: z.unknown(),
      }),
    )
    .optional(),
})

interface RequestPanelProps {
  log: Log
  className?: string
}

/**
 * Whether this log is a same-protocol passthrough.
 *
 * Such a request stores no transformed body by design (the forwarded request is
 * the client's own), so a null body is expected rather than missing. Both
 * protocols must be present and equal: without them there is no evidence of a
 * passthrough, and the generic "no data" message remains the honest answer.
 * @param log - the log being displayed.
 * @returns true when the request was forwarded on the same protocol.
 */
function isSameProtocolPassthrough(log: Log): boolean {
  const { incomingProtocol, targetProtocol } = log
  return incomingProtocol !== null && targetProtocol !== null && incomingProtocol === targetProtocol
}

export function RequestPanel({ log, className }: RequestPanelProps) {
  const hasMessageSequence = !!log.metadata?.messageSequence
  const [selectedMessageIndices, setSelectedMessageIndices] = useState<number[]>([])

  const parsed = RequestBodySchema.safeParse(log.requestBody)
  const messages = parsed.success ? parsed.data.messages : undefined

  const tabCount = hasMessageSequence ? 3 : 2

  return (
    <div
      className={cn(
        'flex flex-col border-r last:border-r-0 bg-background overflow-hidden',
        className,
      )}
    >
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-info" />
          <h3 className="font-semibold text-sm">Request</h3>
        </div>
      </div>
      <Tabs defaultValue="body" className="flex flex-col flex-1 min-h-0">
        <div className="px-4 pt-3 pb-2 border-b bg-muted/10 flex-shrink-0">
          <TabsList className={cn('grid w-full', tabCount === 3 ? 'grid-cols-3' : 'grid-cols-2')}>
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="headers">Headers</TabsTrigger>
            {hasMessageSequence && <TabsTrigger value="analysis">消息分析</TabsTrigger>}
          </TabsList>
        </div>

        <TabsContent value="body" className="flex-1 m-0 flex flex-col min-h-0">
          <BodySubTabs
            tabs={[
              {
                key: 'client',
                label: '客户端',
                data: log.requestBody,
                emptyText: '无客户端请求数据',
              },
              {
                key: 'provider',
                label: 'Provider',
                data: log.transformedRequestBody ?? null,
                emptyText: '无 Provider 请求数据',
                // A null body on a same-protocol request is not missing data:
                // passthrough deliberately stores none (Phase 2 of the storage
                // plan) because the forwarded request is the client's own.
                // Saying "no data" there would read as a defect.
                ...(isSameProtocolPassthrough(log)
                  ? {
                      emptyNote:
                        '同协议透传：转发给 Provider 的请求与客户端请求一致，未单独存储（见存储优化方案 Phase 2）',
                    }
                  : {}),
              },
              {
                key: 'standard',
                label: '标准格式',
                data: log.standardRequestBody ?? null,
                emptyText: '无标准格式请求数据',
              },
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
