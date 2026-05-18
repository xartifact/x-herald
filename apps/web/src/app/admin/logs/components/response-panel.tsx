'use client'

import { HeadersViewer } from '@/components/admin/JsonViewer'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/core/lib/utils'
import type { Log } from '@/hooks/use-logs'

import { BodySubTabs } from './body-sub-tabs'

interface ResponsePanelProps {
  log: Log
  className?: string
}

export function ResponsePanel({ log, className }: ResponsePanelProps) {
  return (
    <div className={cn("flex flex-col border-r last:border-r-0 bg-background overflow-hidden", className)}>
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <h3 className="font-semibold text-sm">Response</h3>
        </div>
      </div>
      <Tabs defaultValue="body" className="flex flex-col flex-1 min-h-0">
        <div className="px-4 pt-3 pb-2 border-b bg-muted/10 flex-shrink-0">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="body">Body</TabsTrigger>
            <TabsTrigger value="headers">Headers</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="body" className="flex-1 m-0 flex flex-col min-h-0">
          <BodySubTabs
            tabs={[
              { key: 'client', label: '客户端', data: log.responseBody, emptyText: '无客户端响应数据' },
              { key: 'provider', label: 'Provider', data: log.providerResponseBody ?? null, emptyText: '无 Provider 响应数据' },
              { key: 'standard', label: '标准格式', data: log.standardResponseBody ?? null, emptyText: '无标准格式数据' },
            ]}
          />
        </TabsContent>

        <TabsContent value="headers" className="flex-1 m-0 overflow-auto">
          <div className="p-4">
            <Tabs defaultValue="client-headers" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="client-headers">客户端响应头</TabsTrigger>
                <TabsTrigger value="provider-headers">Provider 响应头</TabsTrigger>
              </TabsList>
              <TabsContent value="client-headers">
                {log.clientResponseHeaders ? (
                  <HeadersViewer headers={log.clientResponseHeaders} />
                ) : (
                  <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground">
                    无客户端响应头数据
                  </div>
                )}
              </TabsContent>
              <TabsContent value="provider-headers">
                {log.providerResponseHeaders ? (
                  <HeadersViewer headers={log.providerResponseHeaders} />
                ) : (
                  <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground">
                    无 Provider 响应头数据
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
