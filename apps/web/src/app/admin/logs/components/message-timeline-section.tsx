'use client'

import { User, Bot, Settings, Wrench } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import type { LogMetadata } from '@/features/logs/db'

interface MessageTimelineSectionProps {
  messageSequence: LogMetadata['messageSequence']
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

export function MessageTimelineSection({ messageSequence }: MessageTimelineSectionProps) {
  if (!messageSequence || !messageSequence.roles || messageSequence.roles.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
        无消息序列数据
      </div>
    )
  }

  const { totalCount, roles } = messageSequence

  return (
    <div className="p-4 space-y-3">
      <div className="text-sm text-muted-foreground mb-4">
        共 {totalCount} 条消息
      </div>

      {roles.map((roleInfo, index) => {
        const config = roleConfig[roleInfo.role]
        const Icon = config.icon

        return (
          <Card
            key={index}
            className={`border-l-4 ${
              roleInfo.role === 'user'
                ? 'border-l-blue-400'
                : roleInfo.role === 'assistant'
                ? 'border-l-purple-400'
                : roleInfo.role === 'tool'
                ? 'border-l-green-400'
                : 'border-l-gray-400'
            }`}
          >
            <CardHeader className="py-3 px-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
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
                {roleInfo.length !== undefined && (
                  <span className="text-xs text-muted-foreground">
                    {roleInfo.length.toLocaleString()} 字符
                  </span>
                )}
              </div>
            </CardHeader>

            <CardContent className="py-2 px-4 pt-0">
              <div className="space-y-1.5 text-sm">
                {/* 内容类型 */}
                {roleInfo.contentType && roleInfo.contentType.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">内容类型:</span>
                    <div className="flex gap-1">
                      {roleInfo.contentType.map((type, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
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
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
