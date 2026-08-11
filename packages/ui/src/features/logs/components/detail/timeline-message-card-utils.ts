import { Bot, Settings, User, Wrench } from 'lucide-react'

export const roleColors = {
  user: {
    icon: User,
    label: 'User',
    color: 'bg-info/10 text-info border-info/20',
    iconColor: 'text-info',
  },
  assistant: {
    icon: Bot,
    label: 'Assistant',
    color: 'bg-primary/10 text-primary border-primary/20',
    iconColor: 'text-primary',
  },
  system: {
    icon: Settings,
    label: 'System',
    color: 'bg-muted text-muted-foreground border-border',
    iconColor: 'text-muted-foreground',
  },
  tool: {
    icon: Wrench,
    label: 'Tool',
    color: 'bg-success/10 text-success border-success/20',
    iconColor: 'text-success',
  },
}

export const borderColor: Record<string, string> = {
  user: 'border-l-info',
  assistant: 'border-l-primary',
  system: 'border-l-muted-foreground',
  tool: 'border-l-success',
}

export function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b !== 'object' || b === null) return ''
        if ('text' in b) return String((b as Record<string, unknown>).text)
        return ''
      })
      .filter(Boolean)
      .join('\n')
  }
  if (content !== null && content !== undefined) return JSON.stringify(content, null, 2)
  return ''
}

export function extractMessageText(
  message: { role: string; content: unknown } | undefined,
): string {
  if (!message) return ''
  const contentText = extractText(message.content)
  if (contentText) return contentText

  // assistant 发起工具调用时 content 为空，实际内容在 tool_calls
  const toolCalls = (message as Record<string, unknown>).tool_calls
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return ''

  return toolCalls
    .map((tc) => {
      if (typeof tc !== 'object' || tc === null) return ''
      const t = tc as Record<string, unknown>
      const fn = t.function as Record<string, unknown> | undefined
      if (!fn?.name) return JSON.stringify(tc, null, 2)
      const args =
        typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments, null, 2)
      return `🔧 ${String(fn.name)}\n${args ?? ''}`
    })
    .filter(Boolean)
    .join('\n\n')
}
