'use client'

import { useState, useRef, useEffect } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import { Sparkles, Send, Undo2, Bot, Loader2, AlertCircle } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/ui/badge'
import { Button } from '@/ui/button'
import { ScrollArea } from '@/ui/scroll-area'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/ui/sheet'
import { Textarea } from '@/ui/textarea'

import type { InstanceConfig } from '@/features/model-groups/types'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

interface ActionRecord {
  instanceId: string
  instanceName: string
  previousConfig: InstanceConfig | null
  explanation: string
}

interface InstanceAiChatProps {
  instanceId: string
  instanceName: string
}

const QUICK_TEMPLATES = [
  { label: 'Reasoning 映射', prompt: '当 reasoning 参数存在时，映射为 thinking enabled，budget_tokens 设为 8000，并移除原 reasoning 参数' },
  { label: '重试策略', prompt: '配置遇到 429 和 503 时重试 3 次，每次间隔 1 秒' },
  { label: '超时设置', prompt: '设置连接超时 5 秒，读取超时 60 秒' },
  { label: 'Schema 清理', prompt: '开启 schema 字段清理，保留 $defs 字段' },
]

export function InstanceAiChat({ instanceId, instanceName }: InstanceAiChatProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [undoStack, setUndoStack] = useState<ActionRecord[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return

    const userMessage: ChatMessage = { role: 'user', content: content.trim() }
    const nextMessages = [...messages, userMessage]
    setMessages(nextMessages)
    setInput('')
    setLoading(true)

    try {
      const response = await fetch(`/api/ai/agent/instance/${instanceId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
        },
        body: JSON.stringify({ messages: nextMessages }),
      })

      const result = await response.json() as {
        success: boolean
        error?: string
        code?: string
        data?: {
          explanation: string
          previousConfig: InstanceConfig | null
          newConfig: InstanceConfig
          instanceName: string
        }
      }

      if (!result.success || !result.data) {
        const errMsg = result.code === 'AI_NOT_CONFIGURED'
          ? '未配置 AI 功能模型，请先在「设置 → AI 功能模型」中选择一个模型。'
          : (result.error ?? '请求失败，请重试。')
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: errMsg },
        ])
        return
      }

      const { explanation, previousConfig } = result.data

      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: explanation },
      ])

      setUndoStack((prev) => [
        ...prev,
        { instanceId, instanceName, previousConfig, explanation },
      ])

      // 刷新实例列表
      queryClient.invalidateQueries({ queryKey: ['model-instances'] })
      queryClient.invalidateQueries({ queryKey: ['model-groups'] })
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '网络请求失败，请检查连接后重试。' },
      ])
    } finally {
      setLoading(false)
    }
  }

  const handleUndo = async (record: ActionRecord, index: number) => {
    try {
      const response = await fetch(`/api/ai/agent/instance/${record.instanceId}/undo`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('admin_token') || ''}`,
        },
        body: JSON.stringify({ previousConfig: record.previousConfig }),
      })

      if (!response.ok) throw new Error('Undo failed')

      setUndoStack((prev) => prev.filter((_, i) => i !== index))
      queryClient.invalidateQueries({ queryKey: ['model-instances'] })
      queryClient.invalidateQueries({ queryKey: ['model-groups'] })
      toast.success('已撤销配置更改')
    } catch {
      toast.error('撤销失败，请重试')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage(input)
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="h-7 w-7" title="AI 配置助手">
          <Sparkles className="h-3.5 w-3.5" />
        </Button>
      </SheetTrigger>

      <SheetContent className="w-[420px] sm:w-[480px] flex flex-col p-0">
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <SheetTitle className="text-base">AI 配置助手</SheetTitle>
          </div>
          <SheetDescription className="text-xs">
            {instanceName}
          </SheetDescription>
        </SheetHeader>

        {/* 对话区域 */}
        <ScrollArea className="flex-1 px-4" ref={scrollRef as React.RefObject<HTMLDivElement>}>
          <div className="py-4 space-y-4">
            {messages.length === 0 && (
              <div className="text-center py-8 space-y-3">
                <Bot className="h-8 w-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  描述你想要的配置，AI 将直接帮你修改
                </p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {QUICK_TEMPLATES.map((t) => (
                    <button
                      key={t.label}
                      onClick={() => sendMessage(t.prompt)}
                      className="text-xs px-2.5 py-1 rounded-full border bg-background hover:bg-accent transition-colors"
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((msg, i) => (
              <div key={i} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'assistant' && (
                  <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <Sparkles className="h-3 w-3 text-primary" />
                  </div>
                )}
                <div
                  className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  }`}
                >
                  {msg.content}
                </div>
              </div>
            ))}

            {loading && (
              <div className="flex gap-2 justify-start">
                <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="h-3 w-3 text-primary" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* 撤销记录 */}
        {undoStack.length > 0 && (
          <div className="px-4 py-2 border-t space-y-1.5">
            <p className="text-xs text-muted-foreground font-medium">操作记录</p>
            {undoStack.map((record, i) => (
              <div key={i} className="flex items-center justify-between gap-2 text-xs bg-muted/50 rounded px-2 py-1.5">
                <div className="flex items-center gap-1.5 min-w-0">
                  <Badge variant="outline" className="text-[10px] h-4 shrink-0">已应用</Badge>
                  <span className="truncate text-muted-foreground">{record.explanation}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => handleUndo(record, i)}
                  title="撤销此次修改"
                >
                  <Undo2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
          </div>
        )}

        {/* 输入区 */}
        <div className="px-4 py-3 border-t space-y-2">
          {messages.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => sendMessage(t.prompt)}
                  disabled={loading}
                  className="text-[11px] px-2 py-0.5 rounded-full border bg-background hover:bg-accent transition-colors disabled:opacity-50"
                >
                  {t.label}
                </button>
              ))}
            </div>
          )}
          <div className="flex gap-2 items-end">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="描述你想要的配置... (Enter 发送，Shift+Enter 换行)"
              className="min-h-[72px] max-h-[160px] text-sm resize-none"
              disabled={loading}
            />
            <Button
              size="icon"
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              className="h-9 w-9 shrink-0"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            AI 将直接修改配置，可通过上方操作记录撤销
          </p>
        </div>
      </SheetContent>
    </Sheet>
  )
}
