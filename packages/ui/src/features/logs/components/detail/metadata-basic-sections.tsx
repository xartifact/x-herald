import { GitBranch } from 'lucide-react'

import { Badge } from '../../../../shared/components/ui/badge'
import { Button } from '../../../../shared/components/ui/button'
import type { Log } from '@xartifact/x-llm-gateway-shared'

import { InfoRow, Section } from './log-info-row'
import { RequestMetaSection } from './request-meta-section'
import { ContentAnalysisSection } from './content-analysis-section'
import { ToolCallsSection } from './tool-calls-section'
import type { ContentFeatures } from './extract-content-features'

interface MetadataBasicSectionsProps {
  log: Log
  isPending: boolean
  isSuccess: boolean
  contentFeatures: ContentFeatures | null
  onOpenTrace?: () => void
}

export function MetadataBasicSections({
  log,
  isPending,
  isSuccess,
  contentFeatures,
  onOpenTrace,
}: MetadataBasicSectionsProps) {
  return (
    <>
      <RequestMetaSection log={log} isPending={isPending} isSuccess={isSuccess} />

      {log.metadata?.routing && (
        <Section title="路由追踪">
          <InfoRow label="请求模型" value={log.metadata.routing.requestedModel} mono />
          {log.metadata.routing.matchedRuleName && (
            <InfoRow
              label="命中规则"
              value={
                <span>
                  {log.metadata.routing.matchedRuleName}
                  {log.metadata.routing.matchedRulePriority !== undefined && (
                    <span className="ml-1 text-xs text-muted-foreground">
                      (优先级 {log.metadata.routing.matchedRulePriority})
                    </span>
                  )}
                </span>
              }
            />
          )}
          {log.metadata.routing.modelGroupName && (
            <InfoRow label="模型组" value={log.metadata.routing.modelGroupName} />
          )}
          {log.metadata.routing.actualModelName && (
            <InfoRow label="实际模型" value={log.metadata.routing.actualModelName} mono />
          )}
          {log.metadata.routing.strategy && (
            <InfoRow label="决策策略" value={log.metadata.routing.strategy} mono />
          )}
        </Section>
      )}

      {log.errorMessage && (
        <Section
          title="错误详情"
          badge={
            <Badge variant="destructive" className="text-xs">
              Error
            </Badge>
          }
        >
          <div className="p-4 space-y-2">
            <div className="text-sm font-medium text-destructive">{log.errorMessage}</div>
            {log.errorType && (
              <div className="text-xs text-muted-foreground font-mono">类型: {log.errorType}</div>
            )}
          </div>
        </Section>
      )}

      {(log.conversationId || log.metadata?.messageSequence) && (
        <Section
          title="对话上下文"
          action={
            log.conversationId ? (
              <Button
                variant="outline"
                size="sm"
                className="h-6 text-xs gap-1 px-2"
                onClick={() => onOpenTrace?.()}
              >
                <GitBranch className="h-3 w-3" /> 查看完整对话
              </Button>
            ) : undefined
          }
        >
          {log.conversationId && (
            <InfoRow label="对话ID" value={String(log.conversationId)} copyable mono />
          )}
          {log.metadata?.messageSequence && (
            <InfoRow label="消息数量" value={`${log.metadata.messageSequence.totalCount} 条`} />
          )}
          {log.metadata?.conversation?.roleSwitches !== undefined && (
            <InfoRow label="角色切换" value={`${log.metadata.conversation.roleSwitches} 次`} />
          )}
          {log.metadata?.conversation?.hasToolInteraction && (
            <InfoRow label="工具交互" value={<Badge variant="secondary">包含</Badge>} />
          )}
        </Section>
      )}

      <ContentAnalysisSection log={log} contentFeatures={contentFeatures} />
      <ToolCallsSection log={log} />
    </>
  )
}
