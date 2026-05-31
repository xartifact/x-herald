'use client'

import { ChevronRight } from 'lucide-react'

import { Badge } from '../../ui/badge'
import type { Log } from '@x-llm-gateway/shared'

import { InfoRow, Section } from './log-info-row'
import { ContentAnalysisSection } from './content-analysis-section'
import { ToolCallsSection } from './tool-calls-section'
import type { ContentFeatures } from './extract-content-features'

interface MetadataBasicSectionsProps {
  log: Log
  isPending: boolean
  isSuccess: boolean
  contentFeatures: ContentFeatures | null
}

export function MetadataBasicSections({ log, isPending, isSuccess, contentFeatures }: MetadataBasicSectionsProps) {
  return (
    <>
      <Section title="基本信息">
        <InfoRow label="状态">
          <div className="flex items-center gap-2">
            <span className={isPending ? 'text-amber-600' : isSuccess ? 'text-green-600' : 'text-red-600'}>
              {isPending ? '请求中' : isSuccess ? '成功' : '失败'}
            </span>
            {!isPending && log.statusCode != null && (
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{log.statusCode}</code>
            )}
          </div>
        </InfoRow>
        <InfoRow label="模型">{log.modelName}</InfoRow>
        {log.originalModelName && log.originalModelName !== log.modelName && (
          <InfoRow label="原始模型">{log.originalModelName}</InfoRow>
        )}
        <InfoRow label="供应商">{log.providerName || '-'}</InfoRow>
        {log.providerId && <InfoRow label="供应商ID">{log.providerId}</InfoRow>}
        <InfoRow label="虚拟密钥">{log.virtualKeyName || '-'}</InfoRow>
        {log.virtualKeyId && <InfoRow label="密钥ID">{log.virtualKeyId}</InfoRow>}
        {log.incomingProtocol && log.targetProtocol && (
          <InfoRow label="协议转换">
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] font-mono">{log.incomingProtocol}</Badge>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
              <Badge variant="outline" className="text-[10px] font-mono">{log.targetProtocol}</Badge>
            </div>
          </InfoRow>
        )}
      </Section>

      {log.metadata?.routing && (
        <Section title="路由追踪">
          <InfoRow label="请求模型">{log.metadata.routing.requestedModel}</InfoRow>
          {log.metadata.routing.matchedRuleName && (
            <InfoRow label="命中规则">
              <span>
                {log.metadata.routing.matchedRuleName}
                {log.metadata.routing.matchedRulePriority !== undefined && (
                  <span className="ml-1 text-xs text-muted-foreground">
                    (优先级 {log.metadata.routing.matchedRulePriority})
                  </span>
                )}
              </span>
            </InfoRow>
          )}
          {log.metadata.routing.modelGroupName && (
            <InfoRow label="模型组">{log.metadata.routing.modelGroupName}</InfoRow>
          )}
          {log.metadata.routing.actualModelName && (
            <InfoRow label="实际模型">{log.metadata.routing.actualModelName}</InfoRow>
          )}
          {log.metadata.routing.strategy && (
            <InfoRow label="决策策略">{log.metadata.routing.strategy}</InfoRow>
          )}
        </Section>
      )}

      {log.errorMessage && (
        <Section title="错误详情" badge={<Badge variant="destructive" className="text-xs">Error</Badge>}>
          <div className="p-4 space-y-2">
            <div className="text-sm font-medium text-red-600">{log.errorMessage}</div>
            {log.errorType && (
              <div className="text-xs text-muted-foreground font-mono">类型: {log.errorType}</div>
            )}
          </div>
        </Section>
      )}

      {(log.conversationId || log.metadata?.messageSequence) && (
        <Section title="对话上下文">
          {log.conversationId && (
            <InfoRow label="对话ID">{String(log.conversationId)}</InfoRow>
          )}
          {log.metadata?.messageSequence && (
            <InfoRow label="消息数量">{`${log.metadata.messageSequence.totalCount} 条`}</InfoRow>
          )}
          {log.metadata?.conversation?.roleSwitches !== undefined && (
            <InfoRow label="角色切换">{`${log.metadata.conversation.roleSwitches} 次`}</InfoRow>
          )}
          {log.metadata?.conversation?.hasToolInteraction && (
            <InfoRow label="工具交互"><Badge variant="secondary">包含</Badge></InfoRow>
          )}
        </Section>
      )}

      <ContentAnalysisSection contentFeatures={contentFeatures} />
      <ToolCallsSection log={log} />
    </>
  )
}
