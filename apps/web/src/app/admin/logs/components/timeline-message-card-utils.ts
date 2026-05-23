import { Bot, Settings, User, Wrench } from 'lucide-react'

export const roleConfig = {
  user: { icon: User, label: 'User', color: 'bg-blue-50 text-blue-700 border-blue-200', iconColor: 'text-blue-500' },
  assistant: { icon: Bot, label: 'Assistant', color: 'bg-purple-50 text-purple-700 border-purple-200', iconColor: 'text-purple-500' },
  system: { icon: Settings, label: 'System', color: 'bg-gray-50 text-gray-700 border-gray-200', iconColor: 'text-gray-500' },
  tool: { icon: Wrench, label: 'Tool', color: 'bg-green-50 text-green-700 border-green-200', iconColor: 'text-green-500' },
}

export const borderColor: Record<string, string> = {
  user: 'border-l-blue-400',
  assistant: 'border-l-purple-400',
  tool: 'border-l-green-400',
}

export function extractText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    return content.map((b) => {
      if (typeof b !== 'object' || b === null) return ''
      if ('text' in b) return String((b as Record<string, unknown>).text)
      return ''
    }).filter(Boolean).join('\n')
  }
  if (content !== null && content !== undefined) return JSON.stringify(content, null, 2)
  return ''
}

export function extractMessageText(message: { role: string; content: unknown } | undefined): string {
  if (!message) return ''
  const contentText = extractText(message.content)
  if (contentText) return contentText

  // assistant 发起工具调用时 content 为空，实际内容在 tool_calls
  const toolCalls = (message as Record<string, unknown>).tool_calls
  if (!Array.isArray(toolCalls) || toolCalls.length === 0) return ''

  return toolCalls.map((tc) => {
    if (typeof tc !== 'object' || tc === null) return ''
    const t = tc as Record<string, unknown>
    const fn = t.function as Record<string, unknown> | undefined
    if (!fn?.name) return JSON.stringify(tc, null, 2)
    const args = typeof fn.arguments === 'string' ? fn.arguments : JSON.stringify(fn.arguments, null, 2)
    return `🔧 ${String(fn.name)}\n${args ?? ''}`
  }).filter(Boolean).join('\n\n')
}
