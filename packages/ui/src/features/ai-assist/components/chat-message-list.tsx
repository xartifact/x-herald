import { useEffect, useRef } from 'react'

import { Bot, Loader2, Sparkles } from 'lucide-react'

import { ScrollArea } from '../../../shared/components/ui/scroll-area'

import type { ChatMessage } from './chat-types'
import { QUICK_TEMPLATES } from './chat-types'

interface ChatMessageListProps {
  messages: ChatMessage[]
  loading: boolean
  onSend: (message: string) => void
}

export function ChatMessageList({ messages, loading, onSend }: ChatMessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages])

  return (
    <ScrollArea className="flex-1 px-4" ref={scrollRef as React.RefObject<HTMLDivElement>}>
      <div className="py-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-8 space-y-3">
            <Bot className="h-8 w-8 mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">描述你想要的配置，AI 将直接帮你修改</p>
            <div className="flex flex-wrap gap-2 justify-center">
              {QUICK_TEMPLATES.map((t) => (
                <button
                  key={t.label}
                  onClick={() => onSend(t.prompt)}
                  className="text-xs px-2.5 py-1 rounded-full border bg-background hover:bg-accent transition-colors"
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={`${msg.role}-${msg.content}`}
            className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {msg.role === 'assistant' && (
              <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                <Sparkles className="h-3 w-3 text-primary" />
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${msg.role === 'user' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}
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
  )
}
