'use client'

import { ChevronRight } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import type { Log } from '@/hooks/use-logs'

import { InfoRow, Section } from './log-info-row'
import { ToolCallDetailsSection } from './tool-call-details-section'
import type { ContentFeatures } from './utils/extract-content-features'

interface MetadataBasicSectionsProps {
  log: Log
  isPending: boolean
  isSuccess: boolean
  contentFeatures: ContentFeatures | null
}

export function MetadataBasicSections({
  log,
  isPending,
  isSuccess,
  contentFeatures,
}: MetadataBasicSectionsProps) {
  return (
    <>
      {/* === 基本信息 === */}
      <Section title="基本信息">
        <InfoRow
          label="状态"
          value={
            <div className="flex items-center gap-2">
              <span className={isPending ? 'text-amber-600' : isSuccess ? 'text-green-600' : 'text-red-600'}>
                {isPending ? '请求中' : isSuccess ? '成功' : '失败'}
              </span>
              {!isPending && log.statusCode && (
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                  {log.statusCode}
                </code>
              )}
            </div>
          }
        />
        <InfoRow label="模型" value={log.modelName} mono />
        {log.originalModelName && log.originalModelName !== log.modelName && (
          <InfoRow label="原始模型" value={log.originalModelName} mono />
        )}
        <InfoRow label="供应商" value={log.providerName || '-'} />
        {log.providerId && (
          <InfoRow label="供应商ID" value={log.providerId} copyable mono />
        )}
        <InfoRow label="虚拟密钥" value={log.virtualKeyName || '-'} copyable mono />
        {log.virtualKeyId && (
          <InfoRow label="密钥ID" value={log.virtualKeyId} copyable mono />
        )}
        {log.incomingProtocol && log.targetProtocol && (
          <InfoRow
            label="协议转换"
            value={
              <div className="flex items-center gap-1.5">
                <Badge variant="outline" className="text-[10px] font-mono">
                  {log.incomingProtocol}
                </Badge>
                <ChevronRight className="h-3 w-3 text-muted-foreground" />
                <Badge variant="outline" className="text-[10px] font-mono">
                  {log.targetProtocol}
                </Badge>
              </div>
            }
          />
        )}
      </Section>

      {/* === 路由追踪 === */}
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

      {/* === 错误详情 === */}
      {log.errorMessage && (
        <Section
          title="错误详情"
          badge={<Badge variant="destructive" className="text-xs">Error</Badge>}
        >
          <div className="p-4 space-y-2">
            <div className="text-sm font-medium text-red-600">{log.errorMessage}</div>
            {log.errorType && (
              <div className="text-xs text-muted-foreground font-mono">类型: {log.errorType}</div>
            )}
          </div>
        </Section>
      )}

      {/* === 对话上下文 === */}
      {(log.conversationId || log.metadata?.messageSequence) && (
        <Section title="对话上下文">
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

      {/* === 内容分析 === */}
      {(log.metadata?.content || contentFeatures?.request || contentFeatures?.response || contentFeatures?.complexity) && (
        <Section title="内容分析">
          {(log.metadata?.content as { types?: string[] } | undefined)?.types && (log.metadata!.content as { types: string[] }).types.length > 0 && (
            <InfoRow
              label="内容类型"
              value={
                <div className="flex flex-wrap gap-1">
                  {(log.metadata!.content as { types: string[] }).types.map((type: string, idx: number) => (
                    <Badge key={idx} variant="outline" className="text-xs">{type}</Badge>
                  ))}
                </div>
              }
            />
          )}
          {(log.metadata?.content as { hasFunctionCalling?: boolean } | undefined)?.hasFunctionCalling && (
            <InfoRow label="函数调用" value={<Badge variant="secondary">是</Badge>} />
          )}
          {contentFeatures?.request && (
            <>
              <InfoRow label="消息数量" value={contentFeatures.request.messageCount} />
              <InfoRow
                label="角色分布"
                value={
                  <div className="flex items-center gap-2 text-xs">
                    {contentFeatures.request.roleDistribution.user > 0 && (
                      <span>User: {contentFeatures.request.roleDistribution.user}</span>
                    )}
                    {contentFeatures.request.roleDistribution.assistant > 0 && (
                      <>
                        <span className="text-muted-foreground">|</span>
                        <span>Assistant: {contentFeatures.request.roleDistribution.assistant}</span>
                      </>
                    )}
                    {contentFeatures.request.roleDistribution.system > 0 && (
                      <>
                        <span className="text-muted-foreground">|</span>
                        <span>System: {contentFeatures.request.roleDistribution.system}</span>
                      </>
                    )}
                  </div>
                }
              />
              {contentFeatures.request.avgMessageLength > 0 && (
                <InfoRow label="平均消息长度" value={`${contentFeatures.request.avgMessageLength.toLocaleString()} 字符`} />
              )}
              {contentFeatures.request.systemPromptLength && (
                <InfoRow label="系统提示" value={`${contentFeatures.request.systemPromptLength.toLocaleString()} 字符`} />
              )}
            </>
          )}
          {contentFeatures?.response && (
            <>
              <InfoRow label="响应块数" value={contentFeatures.response.blockCount} />
              {contentFeatures.response.blockCount > 0 && (
                <InfoRow
                  label="响应类型"
                  value={
                    <div className="flex items-center gap-2 text-xs">
                      {contentFeatures.response.typeDistribution.text > 0 && (
                        <span>Text: {contentFeatures.response.typeDistribution.text}</span>
                      )}
                      {contentFeatures.response.typeDistribution.toolUse > 0 && (
                        <>
                          <span className="text-muted-foreground">|</span>
                          <span>Tool: {contentFeatures.response.typeDistribution.toolUse}</span>
                        </>
                      )}
                      {contentFeatures.response.typeDistribution.thinking > 0 && (
                        <>
                          <span className="text-muted-foreground">|</span>
                          <span>Thinking: {contentFeatures.response.typeDistribution.thinking}</span>
                        </>
                      )}
                    </div>
                  }
                />
              )}
              {contentFeatures.response.totalLength > 0 && (
                <InfoRow label="响应长度" value={`${contentFeatures.response.totalLength.toLocaleString()} 字符`} />
              )}
            </>
          )}
          {contentFeatures?.complexity && (
            <>
              <InfoRow
                label="上下文长度"
                value={
                  <Badge
                    variant={
                      contentFeatures.complexity.contextLevel === 'extra-long' ? 'destructive' :
                      contentFeatures.complexity.contextLevel === 'long' ? 'secondary' : 'outline'
                    }
                  >
                    {contentFeatures.complexity.contextLevel === 'short' ? '短' :
                     contentFeatures.complexity.contextLevel === 'medium' ? '中' :
                     contentFeatures.complexity.contextLevel === 'long' ? '长' : '超长'}
                  </Badge>
                }
              />
              {contentFeatures.complexity.contentDensity > 0 && (
                <InfoRow label="内容密度" value={`${contentFeatures.complexity.contentDensity} 字符/token`} mono />
              )}
            </>
          )}
        </Section>
      )}

      {/* === 工具调用 === */}
      {!!log.toolCallsCount && log.toolCallsCount > 0 && (
        <Section
          title="工具调用"
          badge={<Badge variant="secondary" className="text-xs">{log.toolCallsCount}</Badge>}
        >
          {log.metadata?.toolCalls?.pattern && (
            <InfoRow
              label="调用模式"
              value={
                <Badge variant="outline">
                  {log.metadata.toolCalls.pattern === 'single' ? '单次' :
                   log.metadata.toolCalls.pattern === 'parallel' ? '并行' : '顺序'}
                </Badge>
              }
            />
          )}
          {(log.metadata?.toolCalls?.tools?.length ?? 0) > 0 && (
            <InfoRow
              label="工具列表"
              value={
                <div className="flex flex-wrap gap-1">
                  {log.metadata!.toolCalls!.tools!.map((tool: string, idx: number) => (
                    <Badge key={idx} variant="secondary" className="text-xs font-mono bg-blue-50 text-blue-700 border-blue-200">
                      {tool}
                    </Badge>
                  ))}
                </div>
              }
            />
          )}
          {log.metadata?.toolCalls?.details && log.metadata.toolCalls.details.length > 0 && (
            <div className="px-3 pb-3">
              <ToolCallDetailsSection toolCalls={log.metadata.toolCalls} />
            </div>
          )}
        </Section>
      )}
    </>
  )
}