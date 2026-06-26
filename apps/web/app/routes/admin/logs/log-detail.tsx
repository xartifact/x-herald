import { useNavigate, useParams } from '@tanstack/react-router'
import { ArrowLeft } from 'lucide-react'
import { useLog } from '../../../hooks/logs'
import { LogDetailContent, Button } from '@x-llm-gateway/ui'

const CLIENT_REGISTRY: Record<string, string> = {
  'claude-code': 'Claude Code',
  'cherry-studio': 'CherryStudio',
  'opencode': 'OpenCode',
  'openclaw': 'OpenClaw',
  'cursor': 'Cursor',
  'cline': 'Cline',
  'aider': 'Aider',
  'continue': 'Continue.dev',
  'litellm': 'LiteLLM',
  'langchain': 'LangChain',
  'openai-python': 'OpenAI Python SDK',
  'openai-node': 'OpenAI Node.js SDK',
  'anthropic-python': 'Anthropic Python SDK',
  'curl': 'cURL',
  'python-httpx': 'Python (httpx)',
  'python-requests': 'Python (requests)',
  'unknown': '未知客户端',
}

const formatDuration = (ms: number) => {
  if (ms < 1000) return `${ms.toFixed(2).replace(/\.00$/, '')}ms`
  return `${(ms / 1000).toFixed(2).replace(/\.00$/, '')}s`
}
const formatTokens = (tokens: number) => {
  if (tokens >= 1000000) return `${(tokens / 1000000).toFixed(1)}M`
  if (tokens >= 1000) return `${(tokens / 1000).toFixed(1)}K`
  return tokens.toLocaleString()
}

export function LogDetailPage() {
  const navigate = useNavigate()
  const { logId } = useParams({ from: '/admin/logs/$logId' })
  const { data, isLoading, isError } = useLog(logId)

  const log = (data as { data?: any } | undefined)?.data ?? null

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/admin/logs' })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回日志列表
        </Button>
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    )
  }

  if (isError || !log) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/admin/logs' })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> 返回日志列表
        </Button>
        <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
          <p>日志不存在或加载失败</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: '/admin/logs' })}>
        <ArrowLeft className="h-4 w-4 mr-1" /> 返回日志列表
      </Button>
      <LogDetailContent
        log={log}
        onClose={() => navigate({ to: '/admin/logs' })}
        formatDuration={formatDuration}
        formatTokens={formatTokens}
        resolveClientType={(ct) => CLIENT_REGISTRY[ct] ?? ct}
      />
    </div>
  )
}
