import type { InstanceConfig } from '@xartifact/x-llm-gateway-shared'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
}

export interface ActionRecord {
  instanceId: string
  instanceName: string
  previousConfig: InstanceConfig | null
  explanation: string
}

export const QUICK_TEMPLATES = [
  {
    label: 'Reasoning 映射',
    prompt:
      '当 reasoning 参数存在时，映射为 thinking enabled，budget_tokens 设为 8000，并移除原 reasoning 参数',
  },
  { label: '重试策略', prompt: '配置遇到 429 和 503 时重试 3 次，每次间隔 1 秒' },
  { label: '超时设置', prompt: '设置连接超时 5 秒，读取超时 60 秒' },
  { label: 'Schema 清理', prompt: '开启 schema 字段清理，保留 $defs 字段' },
]
