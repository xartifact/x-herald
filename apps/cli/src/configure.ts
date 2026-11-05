import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import * as p from '@clack/prompts'

/**
 * Interactive wizard that points a coding tool at this gateway.
 *
 * Writes client-side config only; it never touches the gateway's own settings.
 */
export async function runConfigureWizard(defaultUrl: string): Promise<void> {
  p.intro('x-herald 配置向导')

  const tool = await p.select({
    message: '选择要配置的工具:',
    options: [
      { value: 'opencode', label: 'OpenCode', hint: '生成 opencode.json' },
      { value: 'claude-code', label: 'Claude Code', hint: '生成 ~/.claude/settings.json' },
      { value: 'pi', label: 'Pi', hint: '生成 ~/.pi/agent/models.json' },
      { value: 'codex', label: 'Codex', hint: '生成环境变量配置' },
      { value: 'all', label: '全部', hint: '配置所有工具' },
    ],
  })
  if (p.isCancel(tool)) return p.cancel('已取消')

  const url = await p.text({ message: '网关地址:', defaultValue: defaultUrl })
  if (p.isCancel(url)) return p.cancel('已取消')

  const apiKey = await p.password({ message: '虚拟密钥 (留空跳过):', mask: '*' })
  if (p.isCancel(apiKey)) return p.cancel('已取消')

  const spinner = p.spinner()
  spinner.start('获取网关模型列表...')
  const models = await fetchModelNames(url, apiKey)
  spinner.stop(`获取到 ${models.length} 个模型`)

  const tools = tool === 'all' ? ['opencode', 'claude-code', 'pi', 'codex'] : [tool]
  for (const name of tools) await configureTool(name, url, apiKey ?? '', models)

  p.outro('配置完成!')
}

async function fetchModelNames(url: string, apiKey: string | symbol): Promise<string[]> {
  try {
    const res = await fetch(`${url}/api/v1/models`, {
      headers: typeof apiKey === 'string' && apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
    const data: unknown = await res.json()
    const list = extractModelList(data)
    return list.map((m) => m.id || m.name || '').filter((name): name is string => name.length > 0)
  } catch {
    p.log.warn('无法获取模型列表，将使用空模型列表')
    return []
  }
}

/** Accept both the OpenAI `{data: [...]}` envelope and a bare array. */
function extractModelList(data: unknown): Array<{ id?: string; name?: string }> {
  if (Array.isArray(data)) return data as Array<{ id?: string; name?: string }>
  if (data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)) {
    return data.data as Array<{ id?: string; name?: string }>
  }
  return []
}

async function configureTool(tool: string, url: string, apiKey: string, models: string[]) {
  switch (tool) {
    case 'opencode':
      await configureOpenCode(url, apiKey, models)
      break
    case 'claude-code':
      await configureClaudeCode(url, apiKey)
      break
    case 'pi':
      await configurePi(url, apiKey, models)
      break
    case 'codex':
      await configureCodex(url, apiKey)
      break
  }
}

function readJsonFile(path: string, fallback: Record<string, unknown>): Record<string, unknown> {
  if (!existsSync(path)) return fallback
  try {
    const parsed: unknown = JSON.parse(readFileSync(path, 'utf-8'))
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : fallback
  } catch {
    return fallback
  }
}

async function configureOpenCode(url: string, apiKey: string, models: string[]) {
  const config = {
    $schema: 'https://opencode.ai/config.json',
    provider: {
      'x-herald': {
        npm: '@ai-sdk/openai-compatible',
        name: 'x-herald',
        options: { baseURL: `${url}/api/v1`, ...(apiKey ? { apiKey } : {}) },
        models: Object.fromEntries(models.map((m) => [m, { name: m }])),
      },
    },
  }

  const configPath = join(process.cwd(), 'opencode.json')
  if (existsSync(configPath)) {
    const overwrite = await p.confirm({ message: 'opencode.json 已存在，是否覆盖?' })
    if (!overwrite) {
      p.log.info('跳过 opencode.json')
      return
    }
  }

  writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n')
  p.log.success('opencode.json 已生成')
}

async function configureClaudeCode(url: string, apiKey: string) {
  const settingsDir = join(homedir(), '.claude')
  const settingsPath = join(settingsDir, 'settings.json')
  const existed = existsSync(settingsPath)
  const existing = readJsonFile(settingsPath, {})
  const existingEnv =
    existing.env && typeof existing.env === 'object' ? (existing.env as Record<string, string>) : {}

  const merged = {
    ...existing,
    env: {
      ...existingEnv,
      ANTHROPIC_BASE_URL: url,
      ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
    },
  }

  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n')
  p.log.success(`~/.claude/settings.json 已${existed ? '更新' : '生成'}`)
}

async function configurePi(url: string, apiKey: string, models: string[]) {
  const configDir = join(homedir(), '.pi', 'agent')
  const configPath = join(configDir, 'models.json')
  const existed = existsSync(configPath)
  const existing = readJsonFile(configPath, { providers: {} })
  const providers =
    existing.providers && typeof existing.providers === 'object'
      ? (existing.providers as Record<string, unknown>)
      : {}

  providers['x-herald'] = {
    baseUrl: url,
    api: 'anthropic-messages',
    ...(apiKey ? { apiKey } : {}),
    models: models.map((m) => ({ id: m, name: m })),
  }

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  writeFileSync(configPath, JSON.stringify({ ...existing, providers }, null, 2) + '\n')
  p.log.success(`~/.pi/agent/models.json 已${existed ? '更新' : '生成'}`)
}

async function configureCodex(url: string, apiKey: string) {
  const envContent = [
    '# x-herald 配置 (添加到 ~/.zshrc 或 ~/.bashrc)',
    `export OPENAI_API_BASE="${url}/api/v1"`,
    apiKey ? `export OPENAI_API_KEY="${apiKey}"` : '# export OPENAI_API_KEY="sk-your-key"',
    '',
  ].join('\n')

  p.log.info('Codex 配置（请添加到 shell profile）:')
  console.log(envContent)
  writeFileSync(join(process.cwd(), '.env.x-herald'), envContent)
  p.log.success('.env.x-herald 已生成')
}
