import { z } from 'zod'

import { Badge } from '../../../../shared/components/ui/badge'
import type { Log } from '@xartifact/x-llm-gateway-shared'

import { InfoRow, Section } from './log-info-row'
import type { ContentFeatures } from './extract-content-features'

const ContentMetaSchema = z
  .object({
    types: z.array(z.string()).optional(),
    hasFunctionCalling: z.boolean().optional(),
  })
  .optional()
  .catch(undefined)

interface ContentAnalysisSectionProps {
  log: Log
  contentFeatures: ContentFeatures | null
}

export function ContentAnalysisSection({ log, contentFeatures }: ContentAnalysisSectionProps) {
  if (
    !(
      log.metadata?.content ||
      contentFeatures?.request ||
      contentFeatures?.response ||
      contentFeatures?.complexity
    )
  ) {
    return null
  }

  const contentMeta = ContentMetaSchema.parse(log.metadata?.content)

  return (
    <Section title="内容分析">
      {contentMeta?.types && contentMeta.types.length > 0 && (
        <InfoRow
          label="内容类型"
          value={
            <div className="flex flex-wrap gap-1">
              {contentMeta.types.map((type) => (
                <Badge key={type} variant="outline" className="text-xs">
                  {type}
                </Badge>
              ))}
            </div>
          }
        />
      )}
      {contentMeta?.hasFunctionCalling && (
        <InfoRow label="函数调用" value={<Badge variant="secondary">是</Badge>} />
      )}
      {contentFeatures?.request && (
        <>
          <InfoRow label="消息数量" value={String(contentFeatures.request.messageCount)} />
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
            <InfoRow
              label="平均消息长度"
              value={`${contentFeatures.request.avgMessageLength.toLocaleString()} 字符`}
            />
          )}
          {contentFeatures.request.systemPromptLength && (
            <InfoRow
              label="系统提示"
              value={`${contentFeatures.request.systemPromptLength.toLocaleString()} 字符`}
            />
          )}
        </>
      )}
      {contentFeatures?.response && (
        <>
          <InfoRow label="响应块数" value={String(contentFeatures.response.blockCount)} />
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
            <InfoRow
              label="响应长度"
              value={`${contentFeatures.response.totalLength.toLocaleString()} 字符`}
            />
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
                  contentFeatures.complexity.contextLevel === 'extra-long'
                    ? 'destructive'
                    : contentFeatures.complexity.contextLevel === 'long'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {contentFeatures.complexity.contextLevel === 'short'
                  ? '短'
                  : contentFeatures.complexity.contextLevel === 'medium'
                    ? '中'
                    : contentFeatures.complexity.contextLevel === 'long'
                      ? '长'
                      : '超长'}
              </Badge>
            }
          />
          {contentFeatures.complexity.contentDensity > 0 && (
            <InfoRow
              label="内容密度"
              value={`${contentFeatures.complexity.contentDensity} 字符/token`}
              mono
            />
          )}
        </>
      )}
    </Section>
  )
}
