import { useState } from 'react'

import { ChevronDown, ChevronRight } from 'lucide-react'

import { Badge } from '../../../../shared/components/ui/badge'
import { Button } from '../../../../shared/components/ui/button'
import { Card, CardContent, CardHeader } from '../../../../shared/components/ui/card'
import { Checkbox } from '../../../../shared/components/ui/checkbox'
import type { LogMetadata } from '@xartifact/x-llm-gateway-shared'

import { borderColor, extractMessageText, roleColors } from './timeline-message-card-utils'

type RoleInfo = NonNullable<LogMetadata['messageSequence']>['roles'][0]

const PREVIEW_LENGTH = 300

interface CardDisplayState {
  isExpanded: boolean
  isSelected: boolean
}

interface TimelineMessageCardProps {
  roleInfo: RoleInfo
  message: { role: string; content: unknown } | undefined
  displayState: CardDisplayState
  onSelect: () => void
  onToggleExpand: () => void
}

export function TimelineMessageCard({
  roleInfo,
  message,
  displayState,
  onSelect,
  onToggleExpand,
}: TimelineMessageCardProps) {
  const [isFullText, setIsFullText] = useState(false)
  const { isExpanded, isSelected } = displayState

  const config = roleColors[roleInfo.role] ?? roleColors.user
  const Icon = config.icon
  const rawText = extractMessageText(message)
  const hasContent = rawText.length > 0
  const needsTruncation = rawText.length > PREVIEW_LENGTH
  const displayText =
    hasContent && needsTruncation && !isFullText ? rawText.slice(0, PREVIEW_LENGTH) + '…' : rawText

  return (
    <Card
      className={`border-l-4 cursor-pointer transition-colors hover:bg-accent/30 ${isSelected ? 'ring-1 ring-primary/30' : ''} ${borderColor[roleInfo.role] ?? 'border-l-muted-foreground'}`}
      onClick={onToggleExpand}
    >
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Checkbox
              checked={isSelected}
              onCheckedChange={onSelect}
              onClick={(e) => e.stopPropagation()}
              className="flex-shrink-0"
            />
            <div className={`p-1.5 rounded-md ${config.color}`}>
              <Icon className={`h-4 w-4 ${config.iconColor}`} />
            </div>
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">#{roleInfo.index}</span>
              <Badge variant="outline" className={`text-xs ${config.color}`}>
                {config.label}
              </Badge>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {roleInfo.length !== undefined && (
              <span className="text-xs text-muted-foreground">
                {roleInfo.length.toLocaleString()} 字符
              </span>
            )}
            {hasContent &&
              (isExpanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="py-2 px-4 pt-0">
        <div className="space-y-1.5 text-sm">
          {roleInfo.contentType && roleInfo.contentType.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">内容类型:</span>
              <div className="flex gap-1">
                {roleInfo.contentType.map((type) => (
                  <Badge key={type} variant="secondary" className="text-xs">
                    {type === 'image_url' ? 'image' : type}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          {roleInfo.role === 'assistant' && roleInfo.toolCallCount !== undefined && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">工具调用:</span>
              <Badge
                variant="secondary"
                className="text-xs bg-warning/10 text-warning border-warning/20"
              >
                🔧 {roleInfo.toolCallCount} 个
              </Badge>
            </div>
          )}
          {roleInfo.role === 'tool' && (
            <>
              {roleInfo.toolName && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">工具名称:</span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">
                    {roleInfo.toolName}
                  </code>
                </div>
              )}
              {roleInfo.toolCallId && (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">调用 ID:</span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono truncate max-w-[200px]">
                    {roleInfo.toolCallId}
                  </code>
                </div>
              )}
            </>
          )}
          {isExpanded && hasContent && (
            <div className="mt-2 pt-2 border-t">
              <pre className="text-xs whitespace-pre-wrap break-words font-sans text-foreground/80 leading-relaxed">
                {displayText}
              </pre>
              {needsTruncation && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation()
                    setIsFullText((v) => !v)
                  }}
                  className="mt-1 h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                >
                  {isFullText ? '收起' : `展开全文 (${rawText.length.toLocaleString()} 字符)`}
                </Button>
              )}
            </div>
          )}
          {isExpanded && !hasContent && (
            <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
              暂无可预览的文本内容
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
