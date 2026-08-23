import type { Context } from 'hono'

export interface ClientInfo {
  type: string // slug: 'claude-code', 'cherry-studio', 'curl', 'unknown'
  name: string // display: 'Claude Code', 'CherryStudio', 'cURL'
  version?: string
}

/**
 * Bun.serve() 把 `server` 作为 fetch 的第二个参数传入，Hono 将其暴露为 `c.env`。
 * 反代未透传 x-forwarded-for/x-real-ip 时（如本项目 Docker 直接暴露端口，无前置反代），
 * 这是唯一能拿到真实对端 IP 的途径。
 */
interface BunServerEnv {
  requestIP?: (request: Request) => { address: string } | null
}

const CLIENT_RULES: Array<{ pattern: RegExp; type: string; name: string }> = [
  { pattern: /\bpi-coding-agent\b|^pi\//i, type: 'pi', name: 'Pi' },
  { pattern: /\boh-my-pi\b|^omp\//i, type: 'omp', name: 'Oh My Pi (omp)' },
  { pattern: /\bprime-agent\b|^prime\//i, type: 'prime', name: 'Prime Agent' },
  { pattern: /\bcodex\b/i, type: 'codex', name: 'Codex' },
  { pattern: /claude.?code/i, type: 'claude-code', name: 'Claude Code' },
  { pattern: /claude-cli/i, type: 'claude-code', name: 'Claude Code' },
  { pattern: /cherry.?studio/i, type: 'cherry-studio', name: 'CherryStudio' },
  { pattern: /opencode/i, type: 'opencode', name: 'OpenCode' },
  { pattern: /openclaw/i, type: 'openclaw', name: 'OpenClaw' },
  { pattern: /cursor/i, type: 'cursor', name: 'Cursor' },
  { pattern: /\bcline\b/i, type: 'cline', name: 'Cline' },
  { pattern: /\baider\b/i, type: 'aider', name: 'Aider' },
  { pattern: /continue\.dev/i, type: 'continue', name: 'Continue.dev' },
  { pattern: /litellm/i, type: 'litellm', name: 'LiteLLM' },
  { pattern: /langchain/i, type: 'langchain', name: 'LangChain' },
  { pattern: /openai-python/i, type: 'openai-python', name: 'OpenAI Python SDK' },
  { pattern: /openai\/[0-9]/i, type: 'openai-node', name: 'OpenAI Node.js SDK' },
  { pattern: /anthropic-python/i, type: 'anthropic-python', name: 'Anthropic Python SDK' },
  { pattern: /^curl\//i, type: 'curl', name: 'cURL' },
  { pattern: /python-httpx/i, type: 'python-httpx', name: 'Python (httpx)' },
  { pattern: /python-requests/i, type: 'python-requests', name: 'Python (requests)' },
]

// 前端展示用的名称注册表
export const CLIENT_REGISTRY: Record<string, string> = {
  ...Object.fromEntries(CLIENT_RULES.map((r) => [r.type, r.name])),
  unknown: '未知客户端',
}

export function identifyClient(
  userAgent: string | null | undefined,
  headers?: Record<string, string>,
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
      const versionMatch = userAgent.match(/\/(\d+\.\d+[.\d]*)/)
      return { type: rule.type, name: rule.name, version: versionMatch?.[1] }
    }
  }
  return { type: 'unknown', name: '未知客户端' }
}

/**
 * 解析调用方真实 IP：优先 x-forwarded-for（取第一个）/ x-real-ip（反代场景），
 * 都缺失时回退到 Bun server 的 socket 对端地址（无反代直连场景）。
 */
export function resolveClientIp(c: Context): string {
  const forwardedFor = c.req.header('x-forwarded-for')
  if (forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  const realIp = c.req.header('x-real-ip')
  if (realIp) return realIp

  const env = c.env as unknown as BunServerEnv
  const socketAddress = env?.requestIP?.(c.req.raw)
  return socketAddress?.address ?? 'unknown'
}
