'use client'

import { useState } from 'react'
import {
  Sheet,
  SheetContent,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Copy,
  Check,
  X,
  ChevronRight,
} from 'lucide-react'
import { JsonViewer, HeadersViewer } from '@/components/admin/JsonViewer'
import { cn } from '@/core/lib/utils'
import type { Log } from '@/hooks/use-logs'
import { CLIENT_REGISTRY } from '@/features/gateway/services/client-identifier'
import { MessageTimelineSection } from './message-timeline-section'
import { ToolCallDetailsSection } from './tool-call-details-section'

interface LogDetailSheetProps {
  log?: Log | null
  open: boolean
  onOpenChange: (open: boolean) => void
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

interface InfoRowProps {
  label: string
  value: string | React.ReactNode
  copyable?: boolean
  mono?: boolean
}

function InfoRow({ label, value, copyable = false, mono = false }: InfoRowProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    if (typeof value === 'string') {
      navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex items-start py-2.5 px-4 hover:bg-accent/50 transition-colors group">
      <div className="w-32 flex-shrink-0 text-sm text-muted-foreground font-medium">
        {label}
      </div>
      <div className={cn(
        "flex-1 text-sm",
        mono && "font-mono"
      )}>
        {value}
      </div>
      {copyable && typeof value === 'string' && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={handleCopy}
        >
          {copied ? (
            <Check className="h-3 w-3" />
          ) : (
            <Copy className="h-3 w-3" />
          )}
        </Button>
      )}
    </div>
  )
}

interface SectionProps {
  title: string
  children: React.ReactNode
  badge?: React.ReactNode
  action?: React.ReactNode
}

function Section({ title, children, badge, action }: SectionProps) {
  return (
    <div className="border-b last:border-b-0">
      <div className="px-4 py-2.5 bg-muted/30 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold">{title}</h3>
          {badge}
        </div>
        {action}
      </div>
      <div>{children}</div>
    </div>
  )
}

// Content Features 数据结构
interface ContentFeatures {
  request?: {
    messageCount: number
    roleDistribution: { user: number; assistant: number; system: number }
    avgMessageLength: number
    systemPromptLength?: number
  }
  response?: {
    blockCount: number
    typeDistribution: { text: number; toolUse: number; thinking: number }
    totalLength: number
  }
  tokens?: {
    inputOutputRatio: { input: number; output: number }
    tokensPerSecond: number
    tokensPerMessage: number
  }
  tools?: {
    pattern: string
    complexity: number
  }
  complexity?: {
    contextLevel: 'short' | 'medium' | 'long' | 'extra-long'
    contentDensity: number
  }
}

// 提取内容特征
function extractContentFeatures(log: Log): ContentFeatures | null {
  try {
    const features: ContentFeatures = {}

    // 1. 请求内容统计
    if (log.requestBody?.messages && Array.isArray(log.requestBody.messages)) {
      const messages = log.requestBody.messages as Array<{ role: string; content: unknown }>
      const roleDistribution = { user: 0, assistant: 0, system: 0 }
      let totalLength = 0
      let systemPromptLength: number | undefined

      messages.forEach((msg) => {
        const role = msg.role as 'user' | 'assistant' | 'system'
        if (role in roleDistribution) {
          roleDistribution[role]++
        }

        // 计算消息长度
        const content = msg.content
        let msgLength = 0
        if (typeof content === 'string') {
          msgLength = content.length
        } else if (Array.isArray(content)) {
          msgLength = content.reduce((sum, block) => {
            if (typeof block === 'object' && block !== null && 'text' in block) {
              return sum + String(block.text).length
            }
            return sum
          }, 0)
        }
        totalLength += msgLength

        // 记录 system 消息长度
        if (role === 'system' && !systemPromptLength) {
          systemPromptLength = msgLength
        }
      })

      features.request = {
        messageCount: messages.length,
        roleDistribution,
        avgMessageLength: messages.length > 0 ? Math.round(totalLength / messages.length) : 0,
        systemPromptLength,
      }
    }

    // 2. 响应内容统计
    if (log.responseBody?.content && Array.isArray(log.responseBody.content)) {
      const content = log.responseBody.content as Array<{ type: string; text?: string }>
      const typeDistribution = { text: 0, toolUse: 0, thinking: 0 }
      let totalLength = 0

      content.forEach((block) => {
        if (block.type === 'text') {
          typeDistribution.text++
          if (block.text) {
            totalLength += block.text.length
          }
        } else if (block.type === 'tool_use') {
          typeDistribution.toolUse++
        } else if (block.type === 'thinking') {
          typeDistribution.thinking++
        }
      })

      features.response = {
        blockCount: content.length,
        typeDistribution,
        totalLength,
      }
    }

    // 3. Token 使用详情
    if (log.inputTokens > 0 || log.outputTokens > 0) {
      const totalTokens = log.inputTokens + log.outputTokens
      const inputRatio = totalTokens > 0 ? (log.inputTokens / totalTokens) * 100 : 0
      const outputRatio = totalTokens > 0 ? (log.outputTokens / totalTokens) * 100 : 0

      const tokensPerSecond = log.latencyMs > 0 ? (log.outputTokens / (log.latencyMs / 1000)) : 0
      const tokensPerMessage = features.request?.messageCount
        ? log.inputTokens / features.request.messageCount
        : 0

      features.tokens = {
        inputOutputRatio: {
          input: Math.round(inputRatio * 10) / 10,
          output: Math.round(outputRatio * 10) / 10,
        },
        tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
        tokensPerMessage: Math.round(tokensPerMessage),
      }
    }

    // 4. 工具使用详情
    if (log.metadata?.toolCalls) {
      const toolCalls = log.metadata.toolCalls as { pattern?: string; tools?: string[] }
      features.tools = {
        pattern: toolCalls.pattern || 'unknown',
        complexity: toolCalls.tools?.length || 0,
      }
    }

    // 5. 内容复杂度指标
    if (log.inputTokens > 0) {
      let contextLevel: 'short' | 'medium' | 'long' | 'extra-long'
      if (log.inputTokens < 1000) {
        contextLevel = 'short'
      } else if (log.inputTokens < 10000) {
        contextLevel = 'medium'
      } else if (log.inputTokens < 50000) {
        contextLevel = 'long'
      } else {
        contextLevel = 'extra-long'
      }

      // 计算内容密度（字符数 / Token 数）
      const totalChars = (features.request?.avgMessageLength || 0) * (features.request?.messageCount || 0)
      const contentDensity = log.inputTokens > 0 ? totalChars / log.inputTokens : 0

      features.complexity = {
        contextLevel,
        contentDensity: Math.round(contentDensity * 10) / 10,
      }
    }

    return Object.keys(features).length > 0 ? features : null
  } catch (error) {
    console.error('Failed to extract content features:', error)
    return null
  }
}

interface PanelProps {
  title: string
  icon?: React.ReactNode
  bodyContent: React.ReactNode
  transformedContent?: React.ReactNode
  headers: Record<string, string> | null
  className?: string
}

function Panel({ title, icon, bodyContent, transformedContent, headers, className }: PanelProps) {
  const [activeTab, setActiveTab] = useState<'body' | 'transformed' | 'headers'>('body')
  const hasTransformed = transformedContent !== undefined

  return (
    <div className={cn("flex flex-col border-r last:border-r-0 bg-background", className)}>
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-sm">{title}</h3>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant={activeTab === 'body' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('body')}
            className="h-7 px-3 text-xs"
          >
            Body
          </Button>
          {hasTransformed && (
            <Button
              variant={activeTab === 'transformed' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setActiveTab('transformed')}
              className="h-7 px-3 text-xs"
            >
              Transformed
            </Button>
          )}
          <Button
            variant={activeTab === 'headers' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setActiveTab('headers')}
            className="h-7 px-3 text-xs"
          >
            Headers
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        {activeTab === 'body' && bodyContent}
        {activeTab === 'transformed' && transformedContent}
        {activeTab === 'headers' && (
          <div className="p-4">
            <HeadersViewer headers={headers} />
          </div>
        )}
      </ScrollArea>
    </div>
  )
}

interface RequestPanelProps {
  log: Log
  className?: string
}

function RequestPanel({ log, className }: RequestPanelProps) {
  return (
    <div className={cn("flex flex-col border-r last:border-r-0 bg-background", className)}>
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          <h3 className="font-semibold text-sm">Request</h3>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <Tabs defaultValue="client" className="w-full">
          <div className="px-4 pt-3 pb-2 border-b bg-muted/10">
            <TabsList className="grid w-full"
              style={{
                gridTemplateColumns: log.metadata?.messageSequence
                  ? 'repeat(5, 1fr)'
                  : 'repeat(4, 1fr)'
              }}
            >
              <TabsTrigger value="client">客户端请求</TabsTrigger>
              <TabsTrigger value="provider">Provider 请求</TabsTrigger>
              <TabsTrigger value="standard">标准格式</TabsTrigger>
              <TabsTrigger value="headers">Headers</TabsTrigger>
              {log.metadata?.messageSequence && (
                <TabsTrigger value="message-analysis">消息分析</TabsTrigger>
              )}
            </TabsList>
          </div>

          <TabsContent value="client" className="p-4 m-0">
            {log.requestBody ? (
              <JsonViewer data={log.requestBody} height="calc(100vh - 280px)" />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                无客户端请求数据
              </div>
            )}
          </TabsContent>

          <TabsContent value="provider" className="p-4 m-0">
            {log.transformedRequestBody ? (
              <JsonViewer data={log.transformedRequestBody} height="calc(100vh - 280px)" />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                无 Provider 请求数据
              </div>
            )}
          </TabsContent>

          <TabsContent value="standard" className="p-4 m-0">
            {log.standardRequestBody ? (
              <JsonViewer data={log.standardRequestBody} height="calc(100vh - 280px)" />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                无标准格式请求数据
              </div>
            )}
          </TabsContent>

          <TabsContent value="headers" className="p-4 m-0">
            <Tabs defaultValue="client-headers" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-4">
                <TabsTrigger value="client-headers">客户端请求头</TabsTrigger>
                <TabsTrigger value="provider-headers">Provider 请求头</TabsTrigger>
              </TabsList>

              <TabsContent value="client-headers">
                {log.requestHeaders ? (
                  <HeadersViewer headers={log.requestHeaders} />
                ) : (
                  <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground">
                    无客户端请求头数据
                  </div>
                )}
              </TabsContent>

              <TabsContent value="provider-headers">
                {log.providerRequestHeaders ? (
                  <HeadersViewer headers={log.providerRequestHeaders} />
                ) : (
                  <div className="flex items-center justify-center h-[150px] text-sm text-muted-foreground">
                    无 Provider 请求头数据
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </TabsContent>

          {/* 新增：消息分析 Tab */}
          {log.metadata?.messageSequence && (
            <TabsContent value="message-analysis" className="p-0 m-0">
              <ScrollArea className="h-[calc(100vh-280px)]">
                <MessageTimelineSection messageSequence={log.metadata.messageSequence} />
              </ScrollArea>
            </TabsContent>
          )}
        </Tabs>
      </ScrollArea>
    </div>
  )
}

interface ResponsePanelProps {
  log: Log
  className?: string
}

function ResponsePanel({ log, className }: ResponsePanelProps) {
  return (
    <div className={cn("flex flex-col border-r last:border-r-0 bg-background", className)}>
      <div className="px-4 py-2.5 border-b bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-1.5 rounded-full bg-green-500" />
          <h3 className="font-semibold text-sm">Response</h3>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <Tabs defaultValue="client" className="w-full">
          <div className="px-4 pt-3 pb-2 border-b bg-muted/10">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="client">客户端响应</TabsTrigger>
              <TabsTrigger value="provider">Provider 响应</TabsTrigger>
              <TabsTrigger value="standard">标准格式</TabsTrigger>
              <TabsTrigger value="headers">Headers</TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="client" className="p-4 m-0">
            {log.responseBody ? (
              <JsonViewer data={log.responseBody} height="calc(100vh - 280px)" />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                无客户端响应数据
              </div>
            )}
          </TabsContent>

          <TabsContent value="provider" className="p-4 m-0">
            {log.providerResponseBody ? (
              <JsonViewer data={log.providerResponseBody} height="calc(100vh - 280px)" />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                无 Provider 响应数据
              </div>
            )}
          </TabsContent>

          <TabsContent value="standard" className="p-4 m-0">
            {log.standardResponseBody ? (
              <JsonViewer data={log.standardResponseBody} height="calc(100vh - 280px)" />
            ) : (
              <div className="flex items-center justify-center h-[200px] text-sm text-muted-foreground">
                无标准格式数据
              </div>
            )}
          </TabsContent>

          <TabsContent value="headers" className="p-4 m-0">
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
          </TabsContent>
        </Tabs>
      </ScrollArea>
    </div>
  )
}

export function LogDetailSheet({
  log,
  open,
  onOpenChange,
  formatDuration,
  formatTokens,
}: LogDetailSheetProps) {
  if (!log) return null

  const isSuccess = log.status === 'success'
  const isPending = log.status === 'pending'
  const contentFeatures = extractContentFeatures(log)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[66vw] max-w-[66vw] p-0 flex flex-col gap-0 sm:max-w-[66vw]"
        hideCloseButton
      >
        {/* 顶部工具栏 */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b bg-background">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {isPending ? (
                <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              ) : isSuccess ? (
                <div className="h-2 w-2 rounded-full bg-green-500" />
              ) : (
                <div className="h-2 w-2 rounded-full bg-red-500" />
              )}
              <span className="text-sm font-semibold">
                {log.requestMethod || 'REQUEST'}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">{log.modelName}</span>
            </div>
            <Badge
              variant={isPending ? 'outline' : isSuccess ? 'default' : 'destructive'}
              className={cn(
                "font-mono text-xs",
                isPending && "border-amber-500 text-amber-600"
              )}
            >
              {isPending ? "请求中" : log.statusCode || log.status}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              {new Date(log.createdAt).toLocaleString('zh-CN')}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              className="h-8 w-8"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 主体三栏布局 */}
        <div className="flex-1 grid grid-cols-[minmax(400px,30%)_1fr_1fr] overflow-hidden">
          {/* 左侧面板：元数据 */}
          <div className="flex flex-col border-r bg-muted/20 overflow-hidden">
            <ScrollArea className="flex-1">
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
                <InfoRow
                  label="模型"
                  value={log.modelName}
                  mono
                />
                {log.originalModelName && log.originalModelName !== log.modelName && (
                  <InfoRow
                    label="原始模型"
                    value={log.originalModelName}
                    mono
                  />
                )}
                <InfoRow
                  label="供应商"
                  value={log.providerName || '-'}
                />
                {log.providerId && (
                  <InfoRow
                    label="供应商ID"
                    value={log.providerId}
                    copyable
                    mono
                  />
                )}
                <InfoRow
                  label="虚拟密钥"
                  value={log.virtualKeyName || '-'}
                  copyable
                  mono
                />
                {log.virtualKeyId && (
                  <InfoRow
                    label="密钥ID"
                    value={log.virtualKeyId}
                    copyable
                    mono
                  />
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

              <Section title="性能指标">
                <InfoRow
                  label="延迟"
                  value={
                    <span className={cn(
                      "font-semibold",
                      log.latencyMs < 1000 ? "text-green-600" :
                      log.latencyMs < 3000 ? "text-amber-600" :
                      "text-red-600"
                    )}>
                      {formatDuration(log.latencyMs)}
                    </span>
                  }
                />
                <InfoRow
                  label="流式传输"
                  value={log.streaming ? '是' : '否'}
                />
                <InfoRow
                  label="输入 Token"
                  value={formatTokens(log.inputTokens)}
                  mono
                />
                <InfoRow
                  label="输出 Token"
                  value={formatTokens(log.outputTokens)}
                  mono
                />
                <InfoRow
                  label="总 Token"
                  value={
                    <span className="font-semibold">
                      {formatTokens(log.totalTokens)}
                    </span>
                  }
                  mono
                />
              </Section>

              <Section title="请求信息">
                <InfoRow
                  label="方法"
                  value={log.requestMethod || '-'}
                  mono
                />
                <InfoRow
                  label="路径"
                  value={
                    <span className="text-xs break-all">
                      {log.requestPath || '-'}
                    </span>
                  }
                  copyable
                  mono
                />
                <InfoRow
                  label="客户端 IP"
                  value={log.clientIp || '-'}
                  copyable
                  mono
                />
                <InfoRow
                  label="客户端"
                  value={
                    <div className="space-y-1">
                      <Badge variant="secondary" className="text-xs font-normal">
                        {log.clientType
                          ? (CLIENT_REGISTRY[log.clientType] ?? log.clientType)
                          : '未知客户端'}
                      </Badge>
                      {log.userAgent && log.userAgent !== 'unknown' && (
                        <div className="text-xs text-muted-foreground break-all font-mono">
                          {log.userAgent}
                        </div>
                      )}
                    </div>
                  }
                />
                <InfoRow
                  label="请求 ID"
                  value={
                    <span className="text-xs break-all">
                      {log.id}
                    </span>
                  }
                  copyable
                  mono
                />
              </Section>

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
                    <div className="text-sm font-medium text-red-600">
                      {log.errorMessage}
                    </div>
                    {log.errorType && (
                      <div className="text-xs text-muted-foreground font-mono">
                        类型: {log.errorType}
                      </div>
                    )}
                  </div>
                </Section>
              )}

              <Section title="时间戳">
                <InfoRow
                  label="创建时间"
                  value={new Date(log.createdAt).toLocaleString('zh-CN', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                  })}
                  mono
                />
              </Section>

              {/* 工具调用信息 */}
              {!!log.toolCallsCount && log.toolCallsCount > 0 && (
                <>
                  <Section title="工具调用" badge={log.toolCallsCount.toString()}>
                    <InfoRow
                      label="调用次数"
                      value={log.toolCallsCount.toString()}
                    />
                    {(log.metadata?.toolCalls as Record<string, string> | undefined)?.pattern && (
                      <InfoRow
                        label="调用模式"
                        value={
                          <Badge variant="outline">
                            {(log.metadata?.toolCalls as Record<string, string>).pattern === 'single' ? '单次' :
                             (log.metadata?.toolCalls as Record<string, string>).pattern === 'parallel' ? '并行' : '顺序'}
                          </Badge>
                        }
                      />
                    )}
                    {(log.metadata?.toolCalls as { tools?: string[] } | undefined)?.tools && (log.metadata?.toolCalls as { tools: string[] }).tools.length > 0 && (
                      <InfoRow
                        label="工具列表"
                        value={
                          <div className="flex flex-wrap gap-1">
                            {(log.metadata?.toolCalls as { tools: string[] }).tools.map((tool: string, idx: number) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                {tool}
                              </Badge>
                            ))}
                          </div>
                        }
                      />
                    )}
                  </Section>

                  {/* 新增：工具调用详情 */}
                  {log.metadata?.toolCalls?.details && log.metadata.toolCalls.details.length > 0 && (
                    <Section title="工具调用详情">
                      <div className="px-3 pb-3">
                        <ToolCallDetailsSection toolCalls={log.metadata.toolCalls} />
                      </div>
                    </Section>
                  )}
                </>
              )}

              {(log.conversationId || log.metadata?.messageSequence) && (
                <Section title="对话上下文">
                  {log.conversationId && (
                    <InfoRow
                      label="对话ID"
                      value={String(log.conversationId)}
                      copyable
                      mono
                    />
                  )}
                  {log.metadata?.messageSequence && (
                    <InfoRow
                      label="消息数量"
                      value={`${log.metadata.messageSequence.totalCount} 条`}
                    />
                  )}
                  {log.metadata?.conversation?.roleSwitches !== undefined && (
                    <InfoRow
                      label="角色切换"
                      value={`${log.metadata.conversation.roleSwitches} 次`}
                    />
                  )}
                  {log.metadata?.conversation?.hasToolInteraction && (
                    <InfoRow
                      label="工具交互"
                      value={<Badge variant="secondary">包含</Badge>}
                    />
                  )}
                </Section>
              )}

              {log.metadata?.content && (
                <Section title="内容特征">
                  {/* 原有的内容类型 */}
                  {(log.metadata.content as { types?: string[] }).types && (log.metadata.content as { types: string[] }).types.length > 0 && (
                    <InfoRow
                      label="内容类型"
                      value={
                        <div className="flex flex-wrap gap-1">
                          {(log.metadata.content as { types: string[] }).types.map((type: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {type}
                            </Badge>
                          ))}
                        </div>
                      }
                    />
                  )}
                  {(log.metadata.content as { hasFunctionCalling?: boolean }).hasFunctionCalling && (
                    <InfoRow
                      label="函数调用"
                      value={<Badge variant="secondary">是</Badge>}
                    />
                  )}
                  {/* 使用工具 */}
                  {(log.metadata.content as { toolNames?: string[] }).toolNames && (log.metadata.content as { toolNames: string[] }).toolNames.length > 0 && (
                    <InfoRow
                      label="使用工具"
                      value={
                        <div className="flex flex-wrap gap-1">
                          {(log.metadata.content as { toolNames: string[] }).toolNames.map((tool: string, idx: number) => (
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

                  {/* 新增：请求内容统计 */}
                  {contentFeatures?.request && (
                    <>
                      <InfoRow
                        label="消息数量"
                        value={contentFeatures.request.messageCount}
                      />
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

                  {/* 新增：响应内容统计 */}
                  {contentFeatures?.response && (
                    <>
                      <InfoRow
                        label="响应块数"
                        value={contentFeatures.response.blockCount}
                      />
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

                  {/* 新增：Token 使用详情 */}
                  {contentFeatures?.tokens && (
                    <>
                      <InfoRow
                        label="Token 分布"
                        value={
                          <div className="flex items-center gap-2 text-xs">
                            <span>输入: {contentFeatures.tokens.inputOutputRatio.input}%</span>
                            <span className="text-muted-foreground">|</span>
                            <span>输出: {contentFeatures.tokens.inputOutputRatio.output}%</span>
                          </div>
                        }
                      />
                      {contentFeatures.tokens.tokensPerSecond > 0 && (
                        <InfoRow
                          label="生成速度"
                          value={`${contentFeatures.tokens.tokensPerSecond} tokens/s`}
                          mono
                        />
                      )}
                      {contentFeatures.tokens.tokensPerMessage > 0 && (
                        <InfoRow
                          label="每消息 Token"
                          value={`${contentFeatures.tokens.tokensPerMessage} tokens`}
                          mono
                        />
                      )}
                    </>
                  )}

                  {/* 新增：内容复杂度 */}
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
              )}
            </ScrollArea>
          </div>

          {/* 中间面板：请求 */}
          <RequestPanel log={log} />

          {/* 右侧面板：响应 */}
          <ResponsePanel log={log} />
        </div>

        {/* 底部状态栏 */}
        <div className="flex items-center justify-between px-6 py-2 border-t bg-muted/20 text-xs text-muted-foreground font-mono">
          <div className="flex items-center gap-4">
            <span>延迟: {formatDuration(log.latencyMs)}</span>
            <Separator orientation="vertical" className="h-4" />
            <span>Token: {formatTokens(log.totalTokens)}</span>
            <Separator orientation="vertical" className="h-4" />
            <span className={isPending ? 'text-amber-600' : isSuccess ? 'text-green-600' : 'text-red-600'}>
              {isPending ? '请求中' : isSuccess ? '成功' : '失败'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span>{new Date(log.createdAt).toLocaleTimeString('zh-CN')}</span>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
