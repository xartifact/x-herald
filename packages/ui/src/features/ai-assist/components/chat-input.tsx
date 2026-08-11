import { AlertCircle, Loader2, Send } from 'lucide-react'

import { Button } from '../../../shared/components/ui/button'
import { Textarea } from '../../../shared/components/ui/textarea'

import { QUICK_TEMPLATES } from './chat-types'

interface ChatInputProps {
  input: string
  loading: boolean
  showTemplates: boolean
  onInputChange: (value: string) => void
  onSend: (message: string) => void
}

export function ChatInput({
  input,
  loading,
  showTemplates,
  onInputChange,
  onSend,
}: ChatInputProps) {
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSend(input)
    }
  }

  return (
    <div className="px-4 py-3 border-t space-y-2">
      {showTemplates && (
        <div className="flex flex-wrap gap-1.5">
          {QUICK_TEMPLATES.map((t) => (
            <button
              key={t.label}
              onClick={() => onSend(t.prompt)}
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
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你想要的配置... (Enter 发送，Shift+Enter 换行)"
          className="min-h-[72px] max-h-[160px] text-sm resize-none"
          disabled={loading}
        />
        <Button
          size="icon"
          onClick={() => onSend(input)}
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
  )
}
