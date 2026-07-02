'use client'

import { useState } from 'react'

import { ChevronDown, ChevronUp, Wrench } from 'lucide-react'

import { JsonViewer } from '../../../../shared'
import { Badge } from '../../../../shared/components/ui/badge'
import { Button } from '../../../../shared/components/ui/button'
import { Card, CardContent, CardHeader } from '../../../../shared/components/ui/card'
import type { Log, LogMetadata } from '@xartifact/x-llm-gateway-shared'

import { InfoRow, Section } from './log-info-row'

type ToolCallDetail = NonNullable<NonNullable<LogMetadata['toolCalls']>['details']>[number]

interface ToolCallCardProps {
  detail: ToolCallDetail
  index: number
  isExpanded: boolean
  onToggle: (index: number) => void
}

function ToolCallCard({ detail, index, isExpanded, onToggle }: ToolCallCardProps) {
  return (
    <Card className="border-l-2 border-l-amber-400">
      <CardHeader className="py-2.5 px-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-50">
              <Wrench className="h-3.5 w-3.5 text-amber-600" />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">
                {index + 1}. {detail.name}
              </span>
              {detail.source && (
                <Badge variant="outline" className="text-[10px]">
                  {detail.source === 'request' ? '请求' : '响应'}
                </Badge>
              )}
            </div>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => onToggle(index)}>
            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </Button>
        </div>
        {detail.callId && (
          <div className="mt-1.5 text-xs text-muted-foreground">
            ID: <code className="bg-muted px-1 py-0.5 rounded font-mono">{detail.callId}</code>
          </div>
        )}
      </CardHeader>
      {isExpanded && (
        <CardContent className="py-2 px-3 pt-0 space-y-3">
          {detail.arguments !== undefined && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">参数:</div>
              <div className="bg-muted/50 rounded-md overflow-hidden text-xs">
                <JsonViewer data={detail.arguments} height="auto" />
              </div>
            </div>
          )}
          {detail.result !== undefined && (
            <div>
              <div className="text-xs font-medium text-muted-foreground mb-1.5">结果:</div>
              <div className="bg-muted/50 rounded-md overflow-hidden text-xs">
                <JsonViewer data={detail.result} height="auto" />
              </div>
            </div>
          )}
          {detail.messageIndex !== undefined && (
            <div className="text-xs text-muted-foreground">消息索引: {detail.messageIndex + 1}</div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

interface ToolCallDetailsSectionProps {
  toolCalls: LogMetadata['toolCalls']
}

function ToolCallDetailsSection({ toolCalls }: ToolCallDetailsSectionProps) {
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set())

  if (!toolCalls?.details || toolCalls.details.length === 0) {
    return <div className="text-sm text-muted-foreground py-2">无工具调用详情</div>
  }

  const toggle = (index: number) => {
    const next = new Set(expandedItems)
    if (next.has(index)) next.delete(index)
    else next.add(index)
    setExpandedItems(next)
  }

  return (
    <div className="space-y-2">
      {toolCalls.details.length > 1 && (
        <div className="flex justify-end gap-2 mb-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpandedItems(new Set(toolCalls.details!.map((_, i) => i)))}
          >
            展开全部
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs"
            onClick={() => setExpandedItems(new Set())}
          >
            折叠全部
          </Button>
        </div>
      )}
      {toolCalls.details.map((detail, index) => (
        <ToolCallCard
          key={index}
          detail={detail}
          index={index}
          isExpanded={expandedItems.has(index)}
          onToggle={toggle}
        />
      ))}
    </div>
  )
}

interface ToolCallsSectionProps {
  log: Log
}

export function ToolCallsSection({ log }: ToolCallsSectionProps) {
  if (!log.toolCallsCount || log.toolCallsCount <= 0) return null

  const toolCalls = log.metadata?.toolCalls
  const tools = toolCalls?.tools ?? []

  return (
    <Section
      title="工具调用"
      badge={
        <Badge variant="secondary" className="text-xs">
          {log.toolCallsCount}
        </Badge>
      }
    >
      {toolCalls?.pattern && (
        <InfoRow
          label="调用模式"
          value={
            <Badge variant="outline">
              {toolCalls.pattern === 'single'
                ? '单次'
                : toolCalls.pattern === 'parallel'
                  ? '并行'
                  : '顺序'}
            </Badge>
          }
        />
      )}
      {tools.length > 0 && (
        <InfoRow
          label="工具列表"
          value={
            <div className="flex flex-wrap gap-1">
              {tools.map((tool, idx) => (
                <Badge
                  key={idx}
                  variant="secondary"
                  className="text-xs font-mono bg-blue-50 text-blue-700 border-blue-200"
                >
                  {tool}
                </Badge>
              ))}
            </div>
          }
        />
      )}
      {toolCalls?.details && toolCalls.details.length > 0 && (
        <div className="px-3 pb-3">
          <ToolCallDetailsSection toolCalls={toolCalls} />
        </div>
      )}
    </Section>
  )
}
