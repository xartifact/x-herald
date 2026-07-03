'use client'

import { useState } from 'react'

import { useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { toast } from 'sonner'

import type { InstanceConfig } from '@xartifact/x-llm-gateway-shared'
import { Button } from '../../../shared/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '../../../shared/components/ui/sheet'

import { ChatInput } from './chat-input'
import { ChatMessageList } from './chat-message-list'
import type { ActionRecord, ChatMessage } from './chat-types'
import { ChatUndoRecords } from './chat-undo-records'

interface InstanceAiChatProps {
  instanceId: string
  instanceName: string
}

export function InstanceAiChat({ instanceId, instanceName }: InstanceAiChatProps) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [undoStack, setUndoStack] = useState<ActionRecord[]>([])
  const queryClient = useQueryClient()

  const sendMessage = async (content: string) => {
    if (!content.trim() || loading) return
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: content.trim(),
    }
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
      const result = (await response.json()) as {
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
        const errMsg =
          result.code === 'AI_NOT_CONFIGURED'
            ? '未配置 AI 功能模型，请先在「设置 → AI 功能模型」中选择一个模型。'
            : (result.error ?? '请求失败，请重试。')
        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: 'assistant', content: errMsg } as ChatMessage,
        ])
        return
      }

      const { explanation, previousConfig } = result.data
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', content: explanation } as ChatMessage,
      ])
      setUndoStack((prev) => [...prev, { instanceId, instanceName, previousConfig, explanation }])
      queryClient.invalidateQueries({ queryKey: ['model-instances'] })
      queryClient.invalidateQueries({ queryKey: ['model-groups'] })
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: '网络请求失败，请检查连接后重试。',
        } as ChatMessage,
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
          <SheetDescription className="text-xs">{instanceName}</SheetDescription>
        </SheetHeader>
        <ChatMessageList messages={messages} loading={loading} onSend={sendMessage} />
        <ChatUndoRecords records={undoStack} onUndo={handleUndo} />
        <ChatInput
          input={input}
          loading={loading}
          showTemplates={messages.length > 0}
          onInputChange={setInput}
          onSend={sendMessage}
        />
      </SheetContent>
    </Sheet>
  )
}
