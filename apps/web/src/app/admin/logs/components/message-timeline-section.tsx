'use client'

import { useState } from 'react'

import { Bot, ChevronDown, ChevronRight, Settings, User, Wrench } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import type { LogMetadata } from '@/features/logs/db'

interface MessageTimelineSectionProps {
  messageSequence: LogMetadata['messageSequence']
  messages?: Array<{ role: string; content: unknown }>
  selectedIndices: number[]
  onSelectionChange: (indices: number[]) => void
}

const roleConfig = {
  user: {
    icon: User,
    label: 'User',
    color: 'bg-blue-50 text-blue-700 border-blue-200',
    iconColor: 'text-blue-500',
  },
  assistant: {
    icon: Bot,
    label: 'Assistant',
    color: 'bg-purple-50 text-purple-700 border-purple-200',
    iconColor: 'text-purple-500',
  },
  system: {
    icon: Settings,
    label: 'System',
    color: 'bg-gray-50 text-gray-700 border-gray-200',
    iconColor: 'text-gray-500',
  },
  tool: {
    icon: Wrench,
    label: 'Tool',
    color: 'bg-green-50 text-green-700 border-green-200',
    iconColor: 'text-green-500',
  },
}

const PREVIEW_LENGTH = 300

function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b !== 'object' || b === null) return ''
        if ('text' in b) return String((b as { text: unknown }).text)
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content !== null && content !== undefined) {
    return JSON.stringify(content, null, 2)
  }
  return ''
}

export function MessageTimelineSection({
  messageSequence,
  messages,
  selectedIndices,
  onSelectionChange,
}: MessageTimelineSectionProps) {
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set())
  const [fullTextIndices, setFullTextIndices] = useState<Set<number>>(new Set())

  if (!messageSequence || !messageSequence.roles || messageSequence.roles.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        无消息序列数据
      </div>
    )
  }

  const { totalCount, roles } = messageSequence
  const allIndices = roles.map((r) => r.index)
  const allSelected = allIndices.every((i) => selectedIndices.includes(i))

  function toggleSelected(index: number) {
    if (selectedIndices.includes(index)) {
      onSelectionChange(selectedIndices.filter((i) => i !== index))
    } else {
      onSelectionChange([...selectedIndices, index])
    }
  }

  function toggleSelectAll() {
    if (allSelected) {
      onSelectionChange([])
    } else {
      onSelectionChange(allIndices)
    }
  }

  function toggleExpanded(index: number) {
    setExpandedIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  function toggleFullText(index: number, e: React.MouseEvent) {
    e.stopPropagation()
    setFullTextIndices((prev) => {
      const next = new Set(prev)
      if (next.has(index)) {
        next.delete(index)
      } else {
        next.add(index)
      }
      return next
    })
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-muted-foreground">共 {totalCount} 条消息</span>
        <Button
          variant="ghost"
          size="sm"
          onClick={toggleSelectAll}
          className="h-6 px-2 text-xs"
        >
          {allSelected ? '取消全选' : '全选'}
        </Button>
      </div>

      {roles.map((roleInfo, idx) => {
        const config = roleConfig[roleInfo.role] ?? roleConfig.user
        const Icon = config.icon
        const isExpanded = expandedIndices.has(roleInfo.index)
        const isSelected = selectedIndices.includes(roleInfo.index)
        const isFullText = fullTextIndices.has(roleInfo.index)

        const actualMessage = messages?.[roleInfo.index]
        const rawText = actualMessage ? extractText(actualMessage.content) : ''
        const hasContent = rawText.length > 0
        const needsTruncation = rawText.length > PREVIEW_LENGTH
        const displayText =
          hasContent && needsTruncation && !isFullText
            ? rawText.slice(0, PREVIEW_LENGTH) + '…'
            : rawText

        return (
          <Card
            key={idx}
            className={`border-l-4 cursor-pointer transition-colors hover:bg-accent/30 ${
              isSelected ? 'ring-1 ring-primary/30' : ''
            } ${
              roleInfo.role === 'user'
                ? 'border-l-blue-400'
                : roleInfo.role === 'assistant'
                  ? 'border-l-purple-400'
                  : roleInfo.role === 'tool'
                    ? 'border-l-green-400'
                    : 'border-l-gray-400'
            }`}
            onClick={() => toggleExpanded(roleInfo.index)}
          >
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Checkbox
                    checked={isSelected}
                    onCheckedChange={() => toggleSelected(roleInfo.index)}
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
                  {hasContent && (
                    isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent className="py-2 px-4 pt-0">
              <div className="space-y-1.5 text-sm">
                {/* 内容类型 */}
                {roleInfo.contentType && roleInfo.contentType.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">内容类型:</span>
                    <div className="flex gap-1">
                      {roleInfo.contentType.map((type, tidx) => (
                        <Badge key={tidx} variant="secondary" className="text-xs">
                          {type === 'image_url' ? 'image' : type}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Assistant 消息的工具调用数 */}
                {roleInfo.role === 'assistant' && roleInfo.toolCallCount !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">工具调用:</span>
                    <Badge variant="secondary" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                      🔧 {roleInfo.toolCallCount} 个
                    </Badge>
                  </div>
                )}

                {/* Tool 消息的特殊信息 */}
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

                {/* 内容预览 */}
                {isExpanded && hasContent && (
                  <div className="mt-2 pt-2 border-t">
                    <pre className="text-xs whitespace-pre-wrap break-words font-sans text-foreground/80 leading-relaxed">
                      {displayText}
                    </pre>
                    {needsTruncation && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => toggleFullText(roleInfo.index, e)}
                        className="mt-1 h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        {isFullText ? '收起' : `展开全文 (${rawText.length.toLocaleString()} 字符)`}
                      </Button>
                    )}
                  </div>
                )}

                {/* 无内容提示 */}
                {isExpanded && !hasContent && (
                  <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                    暂无可预览的文本内容
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
