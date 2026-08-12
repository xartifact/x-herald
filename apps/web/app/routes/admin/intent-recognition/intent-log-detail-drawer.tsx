import {
  Badge,
  Button,
  JsonViewer,
  ScrollArea,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@xartifact/x-herald-ui'
import {
  AlertTriangle,
  Clock,
  Cpu,
  Eye,
  FileCode2,
  GitBranch,
  Info,
  Key,
  Layers,
  MessageSquare,
  Mic,
  Video,
  Wrench,
} from 'lucide-react'

import { CopyTextButton } from './copy-text-button'

import type { IntentLogRow } from '../../../hooks/intent-logs'

const INTENT_SOURCE_LABELS: Record<
  string,
  { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }
> = {
  classifier: { label: '分类器 LLM', variant: 'default' },
  fallback: { label: '分类器→default', variant: 'destructive' },
  default: { label: '无分类器', variant: 'outline' },
  model_name: { label: '模型名匹配', variant: 'secondary' },
  capability: { label: '能力匹配', variant: 'secondary' },
  agent_directive: { label: 'agent 指令', variant: 'outline' },
}

function formatLatency(ms: number | null): string {
  if (ms === null) return '—'
  if (ms < 1000) return `${ms.toFixed(2).replace(/\.00$/, '')}ms`
  return `${(ms / 1000).toFixed(2).replace(/\.00$/, '')}s`
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false })
}

interface MetaItemProps {
  icon: React.ReactNode
  label: string
  value: React.ReactNode
}

function MetaItem({ icon, label, value }: MetaItemProps) {
  return (
    <div className="flex items-start gap-2 rounded-md border bg-muted/30 p-3">
      <div className="mt-0.5 text-muted-foreground">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm mt-0.5 break-words">{value}</div>
      </div>
    </div>
  )
}

function JsonSection({ data, empty }: { data: unknown; empty: string }) {
  if (data === null || data === undefined) {
    return <div className="text-xs text-muted-foreground italic px-3 py-2">{empty}</div>
  }
  return <JsonViewer data={data} height="320px" />
}

const CAPABILITY_META: Record<string, { label: string; icon: React.ReactNode }> = {
  vision: { label: 'vision', icon: <Eye className="h-3 w-3" /> },
  audio: { label: 'audio', icon: <Mic className="h-3 w-3" /> },
  video: { label: 'video', icon: <Video className="h-3 w-3" /> },
  tool_use: { label: 'tool_use', icon: <Wrench className="h-3 w-3" /> },
}

function CapabilityBadges({ capabilities }: { capabilities: string[] }) {
  if (!capabilities || capabilities.length === 0) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {capabilities.map((c) => {
        const meta = CAPABILITY_META[c]
        return (
          <Badge key={c} variant="outline" className="text-[10px] gap-1 px-1.5 py-0">
            {meta?.icon ?? null}
            {meta?.label ?? c}
          </Badge>
        )
      })}
    </div>
  )
}

interface ParsedMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

function parseClassifierMessages(raw: unknown[] | null | undefined): ParsedMessage[] {
  if (!Array.isArray(raw)) return []
  const out: ParsedMessage[] = []
  for (const m of raw) {
    if (!m || typeof m !== 'object') continue
    const obj = m as { role?: unknown; content?: unknown }
    if (obj.role !== 'system' && obj.role !== 'user' && obj.role !== 'assistant') continue
    const content =
      typeof obj.content === 'string'
        ? obj.content
        : Array.isArray(obj.content)
          ? obj.content
              .filter(
                (p: unknown) =>
                  !!p && typeof p === 'object' && (p as { type?: unknown }).type === 'text',
              )
              .map((p: unknown) => (p as { text?: unknown }).text ?? '')
              .join('\n')
          : ''
    if (!content) continue
    out.push({ role: obj.role, content })
  }
  return out
}

const ROLE_META: Record<
  ParsedMessage['role'],
  { label: string; badge: 'default' | 'secondary' | 'outline' }
> = {
  user: { label: 'user', badge: 'default' },
  assistant: { label: 'assistant', badge: 'secondary' },
  system: { label: 'system', badge: 'outline' },
}

function ConversationContext({
  messages,
  lastUserMessage,
}: {
  messages: unknown[] | null | undefined
  lastUserMessage: string | null
}) {
  const parsed = parseClassifierMessages(messages)
  const visibleMessages = parsed.filter((m) => m.role !== 'system')
  const lastUserIdx = (() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i].role === 'user') return i
    }
    return -1
  })()
  const lastUserContent = lastUserMessage ?? ''

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="text-xs font-semibold">分类器看到的对话上下文</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            共 {visibleMessages.length} 条消息（不含 system），最后一条 user 是被分类的对象
          </div>
        </div>
        <CopyTextButton value={JSON.stringify(visibleMessages, null, 2)} label="复制全部" />
      </div>

      <div className="space-y-2">
        {visibleMessages.length === 0 ? (
          <div className="text-xs text-muted-foreground italic px-3 py-2">
            （无 user/assistant 消息，仅有 system prompt）
          </div>
        ) : (
          visibleMessages.map((m, idx) => {
            const meta = ROLE_META[m.role]
            const isLastUser = idx === lastUserIdx && m.role === 'user'
            const isHighlight =
              isLastUser &&
              m.content.trim() === lastUserContent.trim() &&
              lastUserContent.length > 0
            return (
              <div
                key={m.role + '-' + m.content.slice(0, 50)}
                className={`rounded-md border p-3 ${
                  isHighlight ? 'border-warning/30 bg-warning/10' : 'bg-muted/30'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-1.5">
                    <Badge variant={meta.badge} className="text-[10px]">
                      {meta.label}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground font-mono">#{idx + 1}</span>
                    {isHighlight && (
                      <Badge
                        variant="outline"
                        className="text-[10px] border-warning/40 text-warning"
                      >
                        待分类
                      </Badge>
                    )}
                  </div>
                  <CopyTextButton value={m.content} label="复制" />
                </div>
                <pre className="text-xs whitespace-pre-wrap break-words font-mono leading-relaxed">
                  {m.content}
                </pre>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}

interface IntentLogDetailDrawerProps {
  log: IntentLogRow | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onNavigateToPrompts?: () => void
}

export function IntentLogDetailDrawer({
  log,
  open,
  onOpenChange,
  onNavigateToPrompts,
}: IntentLogDetailDrawerProps) {
  if (!log) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="!w-[70vw] !max-w-[1200px] p-0"
          hideCloseButton={false}
        />
      </Sheet>
    )
  }

  const sourceMeta = INTENT_SOURCE_LABELS[log.intentSource] ?? INTENT_SOURCE_LABELS.default
  const isFallback = log.intentSource === 'fallback'
  const isAgentDirective = log.intentSource === 'agent_directive'

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="!w-[70vw] !max-w-[1200px] gap-0 p-0">
        <SheetHeader className="border-b px-6 py-4 space-y-2">
          <div className="flex items-center gap-3">
            <SheetTitle className="text-xl">
              意图：<span className="font-mono">{log.intentName}</span>
            </SheetTitle>
            <Badge variant={sourceMeta.variant}>{sourceMeta.label}</Badge>
            {log.intentConfidence != null && (
              <span className="text-xs text-muted-foreground font-mono">
                置信度 {log.intentConfidence.toFixed(3)}
              </span>
            )}
          </div>
          <SheetDescription className="flex items-center gap-3 text-xs">
            <span>{formatTime(log.createdAt)}</span>
            <span>·</span>
            <span className="font-mono">
              {log.classifierLatencyMs != null ? formatLatency(log.classifierLatencyMs) : '—'}
            </span>
            {log.classifierStatusCode != null && (
              <>
                <span>·</span>
                <span className={isFallback ? 'text-destructive font-mono' : 'font-mono'}>
                  HTTP {log.classifierStatusCode}
                </span>
              </>
            )}
            <span className="ml-auto flex items-center gap-2">
              {log.classifierPromptVersion != null && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs text-muted-foreground"
                  onClick={onNavigateToPrompts}
                >
                  Prompt v{log.classifierPromptVersion}
                </Button>
              )}
              <CopyTextButton value={log.id} label="复制 ID" />
            </span>
          </SheetDescription>

          {log.userMessageCapabilities && log.userMessageCapabilities.length > 0 && (
            <div className="pt-1">
              <CapabilityBadges capabilities={log.userMessageCapabilities} />
            </div>
          )}
        </SheetHeader>

        {isFallback && (
          <div className="border-b bg-destructive/10 px-6 py-2.5 text-xs text-destructive flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">分类器未返回有效结果，已落到默认组</div>
              {log.classifierRawResponse && (
                <div className="mt-1 font-mono break-all opacity-80">
                  {log.classifierRawResponse.slice(0, 240)}
                  {log.classifierRawResponse.length > 240 ? '…' : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {isAgentDirective && (
          <div className="border-b bg-info/10 px-6 py-2.5 text-xs text-info flex items-start gap-2">
            <Info className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="min-w-0">
              <div className="font-semibold">agent 系统指令，未调用分类器</div>
              <div className="mt-1 opacity-80">
                首行匹配 agent 框架指令标记（[SYSTEM] / [internal] / [Status:]
                等），路由到默认组不消耗分类器 token
              </div>
            </div>
          </div>
        )}

        <Tabs defaultValue="summary" className="flex-1 flex flex-col min-h-0">
          <TabsList className="border-b rounded-none justify-start h-10 px-6 bg-transparent">
            <TabsTrigger value="summary">
              <FileCode2 className="mr-1.5 h-3.5 w-3.5" />
              概要
            </TabsTrigger>
            <TabsTrigger value="user">
              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
              对话上下文
            </TabsTrigger>
            <TabsTrigger value="classifier">
              <Cpu className="mr-1.5 h-3.5 w-3.5" />
              分类器 I/O
            </TabsTrigger>
            <TabsTrigger value="http">
              <GitBranch className="mr-1.5 h-3.5 w-3.5" />
              原始 HTTP
            </TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="p-6 space-y-3">
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                  <MetaItem
                    icon={<Clock className="h-4 w-4" />}
                    label="分类器耗时"
                    value={
                      log.classifierLatencyMs != null ? (
                        <span className="font-mono">
                          {formatLatency(log.classifierLatencyMs)}
                          {log.classifierProviderName && (
                            <span className="text-muted-foreground">
                              {' · '}
                              {log.classifierProviderName} / {log.classifierModelName}
                            </span>
                          )}
                        </span>
                      ) : (
                        '—'
                      )
                    }
                  />
                  <MetaItem
                    icon={<Cpu className="h-4 w-4" />}
                    label="接入模型"
                    value={log.accessModelName ?? '—'}
                  />
                  <MetaItem
                    icon={<Layers className="h-4 w-4" />}
                    label="目标组"
                    value={log.targetGroupName ?? '—'}
                  />
                  <MetaItem
                    icon={<GitBranch className="h-4 w-4" />}
                    label="路由规则"
                    value={
                      log.modelRouteName
                        ? `${log.modelRouteName}${log.modelRoutePriority != null ? ` (priority ${log.modelRoutePriority})` : ''}`
                        : '—'
                    }
                  />
                  <MetaItem
                    icon={<Key className="h-4 w-4" />}
                    label="调用方"
                    value={log.virtualKeyName ?? '—'}
                  />
                  <MetaItem
                    icon={<FileCode2 className="h-4 w-4" />}
                    label="Prompt 版本"
                    value={
                      log.classifierPromptVersion != null ? (
                        <span className="font-mono">v{log.classifierPromptVersion}</span>
                      ) : (
                        '—'
                      )
                    }
                  />
                </div>

                {log.requestGroupId && (
                  <div className="rounded-md border bg-muted/30 p-3 text-xs">
                    <span className="text-muted-foreground">关联请求：</span>
                    <span className="font-mono">{log.requestGroupId}</span>
                  </div>
                )}

                {log.userMessage && (
                  <div>
                    <div className="text-xs font-semibold text-muted-foreground mb-2">
                      用户消息预览
                    </div>
                    <pre className="rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words font-mono max-h-48 overflow-y-auto">
                      {log.userMessage.length > 600
                        ? log.userMessage.slice(0, 600) + '…'
                        : log.userMessage}
                    </pre>
                  </div>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="user" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="p-6 space-y-4">
                <ConversationContext
                  messages={log.classifierRequestMessages}
                  lastUserMessage={log.userMessage}
                />

                {log.userMessageRaw && log.userMessageRaw !== log.userMessage && (
                  <details className="rounded-md border bg-warning/10">
                    <summary className="cursor-pointer text-xs font-semibold text-warning p-3 select-none">
                      最后一条原始消息（含 system-reminder / tool output，已被剥离）
                    </summary>
                    <pre className="rounded-b-md border-t bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words font-mono max-h-96 overflow-y-auto">
                      {log.userMessageRaw}
                    </pre>
                  </details>
                )}
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="classifier" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="p-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                      分类器原始返回
                      {log.intentSource === 'fallback' && (
                        <Badge variant="destructive" className="ml-2 text-[10px]">
                          fallback
                        </Badge>
                      )}
                    </div>
                    <CopyTextButton value={log.classifierRawResponse ?? ''} label="复制" />
                  </div>
                  <pre
                    className={`rounded-md border p-3 text-xs whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto ${
                      log.intentSource === 'fallback'
                        ? 'bg-destructive/10 border-destructive/20 text-destructive'
                        : 'bg-muted/40'
                    }`}
                  >
                    {log.classifierRawResponse || '—'}
                  </pre>
                </div>

                {log.classifierReasoning && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs font-semibold text-muted-foreground">
                        分类器 Reasoning（思考链）
                      </div>
                      <CopyTextButton value={log.classifierReasoning} label="复制" />
                    </div>
                    <pre className="rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap break-words font-mono max-h-64 overflow-y-auto">
                      {log.classifierReasoning}
                    </pre>
                  </div>
                )}

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                      分类器 Messages 数组
                      {log.classifierRequestMessages && (
                        <span className="ml-1 text-muted-foreground font-normal">
                          ({log.classifierRequestMessages.length} 条)
                        </span>
                      )}
                    </div>
                    <CopyTextButton
                      value={JSON.stringify(log.classifierRequestMessages ?? null, null, 2)}
                      label="复制"
                    />
                  </div>
                  <JsonSection data={log.classifierRequestMessages} empty="无 messages 数组" />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="http" className="flex-1 min-h-0 mt-0">
            <ScrollArea className="h-[calc(100vh-220px)]">
              <div className="p-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-muted-foreground">Request Body</div>
                    <CopyTextButton
                      value={JSON.stringify(log.classifierRequestBody ?? null, null, 2)}
                      label="复制"
                    />
                  </div>
                  <JsonSection data={log.classifierRequestBody} empty="无请求 body" />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-xs font-semibold text-muted-foreground">
                      Response Body
                      {log.classifierStatusCode != null && (
                        <span className="ml-2 font-mono text-muted-foreground font-normal">
                          HTTP {log.classifierStatusCode}
                        </span>
                      )}
                    </div>
                    <CopyTextButton
                      value={JSON.stringify(log.classifierResponseBody ?? null, null, 2)}
                      label="复制"
                    />
                  </div>
                  <JsonSection data={log.classifierResponseBody} empty="无响应 body" />
                </div>
              </div>
            </ScrollArea>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  )
}
