export interface ClientInfo {
  type: string    // slug: 'claude-code', 'cherry-studio', 'curl', 'unknown'
  name: string    // display: 'Claude Code', 'CherryStudio', 'cURL'
  version?: string
}

const CLIENT_RULES: Array<{ pattern: RegExp; type: string; name: string }> = [
  { pattern: /claude.?code/i,      type: 'claude-code',      name: 'Claude Code' },
  { pattern: /claude-cli/i,        type: 'claude-code',      name: 'Claude Code' },
  { pattern: /cherry.?studio/i,    type: 'cherry-studio',    name: 'CherryStudio' },
  { pattern: /opencode/i,          type: 'opencode',         name: 'OpenCode' },
  { pattern: /openclaw/i,          type: 'openclaw',         name: 'OpenClaw' },
  { pattern: /cursor/i,            type: 'cursor',           name: 'Cursor' },
  { pattern: /\bcline\b/i,         type: 'cline',            name: 'Cline' },
  { pattern: /\baider\b/i,         type: 'aider',            name: 'Aider' },
  { pattern: /continue\.dev/i,     type: 'continue',         name: 'Continue.dev' },
  { pattern: /litellm/i,           type: 'litellm',          name: 'LiteLLM' },
  { pattern: /langchain/i,         type: 'langchain',        name: 'LangChain' },
  { pattern: /openai-python/i,     type: 'openai-python',    name: 'OpenAI Python SDK' },
  { pattern: /openai\/[0-9]/i,     type: 'openai-node',      name: 'OpenAI Node.js SDK' },
  { pattern: /anthropic-python/i,  type: 'anthropic-python', name: 'Anthropic Python SDK' },
  { pattern: /^curl\//i,           type: 'curl',             name: 'cURL' },
  { pattern: /python-httpx/i,      type: 'python-httpx',     name: 'Python (httpx)' },
  { pattern: /python-requests/i,   type: 'python-requests',  name: 'Python (requests)' },
]

// 前端展示用的名称注册表
export const CLIENT_REGISTRY: Record<string, string> = {
  ...Object.fromEntries(CLIENT_RULES.map(r => [r.type, r.name])),
  unknown: '未知客户端',
}

export function identifyClient(
  userAgent: string | null | undefined,
  headers?: Record<string, string>
): ClientInfo {
  // 优先从 x-client-name Header 识别
  const customName = headers?.['x-client-name']
  if (customName) {
    return { type: customName.toLowerCase().replace(/\s+/g, '-'), name: customName }
  }
  if (!userAgent || userAgent === 'unknown') {
    return { type: 'unknown', name: '未知客户端' }
  }
  // User-Agent 规则匹配
  for (const rule of CLIENT_RULES) {
    if (rule.pattern.test(userAgent)) {
      const versionMatch = userAgent.match(/\/(\d+\.\d+[\.\d]*)/)
      return { type: rule.type, name: rule.name, version: versionMatch?.[1] }
    }
  }
  return { type: 'unknown', name: '未知客户端' }
}
