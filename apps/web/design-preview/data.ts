export interface Instance {
  id: string
  name: string
  model: string
  provider: string
  enabled: boolean
  latency: string
  context: string
}

export interface Group {
  id: string
  name: string
  slug: string
  description: string
  strategy: string
  fallback: boolean
  members: string[]
  tone: string
}

export interface Provider {
  id: string
  name: string
  initial: string
  tone: string
  protocol: string
  url: string
  enabled: boolean
}

export const initialProviders: Provider[] = [
  {
    id: 'anthropic',
    name: 'Anthropic',
    initial: 'A',
    tone: 'sand',
    protocol: 'Anthropic',
    url: 'https://api.anthropic.com',
    enabled: true,
  },
  {
    id: 'openai',
    name: 'OpenAI',
    initial: 'O',
    tone: 'mint',
    protocol: 'OpenAI',
    url: 'https://api.openai.com/v1',
    enabled: true,
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    initial: 'D',
    tone: 'blue',
    protocol: 'OpenAI',
    url: 'https://api.deepseek.com/v1',
    enabled: true,
  },
]

export const initialInstances: Instance[] = [
  {
    id: 'i1',
    name: 'Claude Sonnet · 主力',
    model: 'claude-sonnet-4-5',
    provider: 'anthropic',
    enabled: true,
    latency: '420 ms',
    context: '200K',
  },
  {
    id: 'i2',
    name: 'GPT · 通用备用',
    model: 'gpt-4.1',
    provider: 'openai',
    enabled: true,
    latency: '386 ms',
    context: '1M',
  },
  {
    id: 'i3',
    name: 'DeepSeek · 高性价比',
    model: 'deepseek-chat',
    provider: 'deepseek',
    enabled: true,
    latency: '218 ms',
    context: '128K',
  },
  {
    id: 'i4',
    name: 'Claude Haiku · 轻量',
    model: 'claude-haiku-4-5',
    provider: 'anthropic',
    enabled: true,
    latency: '185 ms',
    context: '200K',
  },
  {
    id: 'i5',
    name: 'DeepSeek · 推理',
    model: 'deepseek-reasoner',
    provider: 'deepseek',
    enabled: false,
    latency: '—',
    context: '128K',
  },
  {
    id: 'i6',
    name: 'GPT mini · 快速',
    model: 'gpt-4.1-mini',
    provider: 'openai',
    enabled: true,
    latency: '162 ms',
    context: '1M',
  },
]

export const initialGroups: Group[] = [
  {
    id: 'g1',
    name: '通用对话',
    slug: 'general-chat',
    description: '日常问答与内容创作，兼顾响应质量和服务稳定性。',
    strategy: 'priority',
    fallback: true,
    members: ['i1', 'i2', 'i3'],
    tone: 'purple',
  },
  {
    id: 'g2',
    name: '代码助手',
    slug: 'coding-assistant',
    description: '为代码生成、重构与技术问答提供模型服务。',
    strategy: 'smart',
    fallback: true,
    members: ['i1', 'i2'],
    tone: 'blue',
  },
  {
    id: 'g3',
    name: '轻量任务',
    slug: 'fast-response',
    description: '低延迟的分类、摘要和简单问答。',
    strategy: 'round_robin',
    fallback: true,
    members: ['i4', 'i6'],
    tone: 'mint',
  },
  {
    id: 'g4',
    name: '深度推理',
    slug: 'deep-reasoning',
    description: '复杂问题分析与多步骤推理。',
    strategy: 'priority',
    fallback: false,
    members: ['i5'],
    tone: 'sand',
  },
]

export const strategies: Record<string, string> = {
  priority: '优先级路由',
  smart: '智能路由',
  round_robin: '轮询路由',
}
