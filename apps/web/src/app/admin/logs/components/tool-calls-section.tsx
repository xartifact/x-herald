import { Badge } from '@/components/ui/badge'
import type { Log } from '@/hooks/use-logs'

import { InfoRow, Section } from './log-info-row'
import { ToolCallDetailsSection } from './tool-call-details-section'

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
      badge={<Badge variant="secondary" className="text-xs">{log.toolCallsCount}</Badge>}
    >
      {toolCalls?.pattern && (
        <InfoRow
          label="调用模式"
          value={
            <Badge variant="outline">
              {toolCalls.pattern === 'single' ? '单次' :
               toolCalls.pattern === 'parallel' ? '并行' : '顺序'}
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
                <Badge key={idx} variant="secondary" className="text-xs font-mono bg-blue-50 text-blue-700 border-blue-200">
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
