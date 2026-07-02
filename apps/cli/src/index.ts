#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { Command } from 'commander'
import * as p from '@clack/prompts'
import { GatewayClient } from './client'

const program = new Command()

program
  .name('xgate')
  .description('x-llm-gateway management CLI')
  .version('0.1.0')
  .option('-u, --url <url>', 'API base URL', process.env.XGATE_URL || 'http://localhost:3000')
  .option('-k, --api-key <key>', 'API key', process.env.XGATE_API_KEY)

// Providers
const providers = program.command('providers').description('Manage providers')

providers
  .command('list')
  .description('List all providers')
  .action(async () => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey })
    const data = await client.listProviders()
    console.table(
      data.map((p) => ({
        ID: p.id,
        Name: p.name,
        Protocol: Object.keys(p.protocols).join(', '),
        Enabled: p.enabled,
      })),
    )
  })

providers
  .command('get <id>')
  .description('Get provider details')
  .action(async (id: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey })
    const data = await client.getProvider(id)
    console.log(JSON.stringify(data, null, 2))
  })

providers
  .command('delete <id>')
  .description('Delete a provider')
  .action(async (id: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey })
    await client.deleteProvider(id)
    console.log(`Provider ${id} deleted`)
  })

// Models
const modelsCmd = program.command('models').description('List models')
modelsCmd
  .command('list')
  .description('List all model groups')
  .action(async () => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey })
    const data = await client.listModelGroups()
    console.table(data.map((g) => ({ ID: g.id, Name: g.name, Enabled: g.enabled })))
  })

// Keys
const keys = program.command('keys').description('Manage API keys')

keys
  .command('list')
  .description('List all keys')
  .action(async () => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey })
    const data = await client.listKeys()
    console.table(data.map((k) => ({ ID: k.id, Name: k.name, Enabled: k.enabled })))
  })

keys
  .command('create <name>')
  .description('Create a new key')
  .action(async (name: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey })
    const data = await client.createKey({ name })
    console.log(`Key created: ${data.id}`)
    console.log(`Key value: ${data.key}`)
  })

keys
  .command('delete <id>')
  .description('Delete a key')
  .action(async (id: string) => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey })
    await client.deleteKey(id)
    console.log(`Key ${id} deleted`)
  })

// Health
program
  .command('health')
  .description('Check gateway health')
  .action(async () => {
    const client = new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey })
    const status = await client.getHealth()
    console.log(`Status: ${status.status}`)
    if (status.status) {
      console.table(
        status.status.map((c) => ({ Name: c.name, Status: c.status, Message: c.message || '' })),
      )
    }
  })

// Configure
const configure = program.command('configure').description('配置 AI 工具使用 x-llm-gateway')

configure.action(async () => {
  p.intro('x-llm-gateway 配置向导')

  // 选择工具
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

  // 获取网关地址
  const url = await p.text({
    message: '网关地址:',
    defaultValue: program.opts().url || 'http://localhost:3000',
  })
  if (p.isCancel(url)) return p.cancel('已取消')

  // 获取 API Key
  const apiKey = await p.password({
    message: '虚拟密钥 (留空跳过):',
    mask: '*',
  })
  if (p.isCancel(apiKey)) return p.cancel('已取消')

  // 获取模型列表
  const s = p.spinner()
  s.start('获取网关模型列表...')
  let models: string[] = []
  try {
    const res = await fetch(`${url}/api/v1/models`, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
    })
    const data = (await res.json()) as
      | { data?: Array<{ id?: string; name?: string }>; id?: string; name?: string }
      | Array<{ id?: string; name?: string }>
    const list =
      data && typeof data === 'object' && 'data' in data && Array.isArray(data.data)
        ? data.data
        : Array.isArray(data)
          ? data
          : []
    models = list
      .map((m: { id?: string; name?: string }) => m.id || m.name || String(m))
      .filter(Boolean)
    s.stop(`获取到 ${models.length} 个模型`)
  } catch {
    s.stop('无法获取模型列表，将使用空模型列表')
  }

  // 执行配置
  const tools = tool === 'all' ? ['opencode', 'claude-code', 'pi', 'codex'] : [tool as string]

  for (const t of tools) {
    await configureTool(t, url as string, apiKey as string, models)
  }

  p.outro('配置完成!')
})

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

async function configureOpenCode(url: string, apiKey: string, models: string[]) {
  const config = {
    $schema: 'https://opencode.ai/config.json',
    provider: {
      'x-llm-gateway': {
        npm: '@ai-sdk/openai-compatible',
        name: 'x-llm-gateway',
        options: {
          baseURL: `${url}/api/v1`,
          ...(apiKey ? { apiKey } : {}),
        },
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

  let existing: Record<string, unknown> = {}
  if (existsSync(settingsPath)) {
    try {
      existing = JSON.parse(readFileSync(settingsPath, 'utf-8'))
    } catch {
      // ignore parse errors
    }
  }

  const merged = {
    ...existing,
    env: {
      ...((existing.env as Record<string, string>) || {}),
      ANTHROPIC_BASE_URL: url,
      ...(apiKey ? { ANTHROPIC_API_KEY: apiKey } : {}),
    },
  }

  if (!existsSync(settingsDir)) mkdirSync(settingsDir, { recursive: true })
  writeFileSync(settingsPath, JSON.stringify(merged, null, 2) + '\n')
  p.log.success(`~/.claude/settings.json 已${existsSync(settingsPath) ? '更新' : '生成'}`)
}

async function configurePi(url: string, apiKey: string, models: string[]) {
  const configDir = join(homedir(), '.pi', 'agent')
  const configPath = join(configDir, 'models.json')

  let existing: Record<string, unknown> = { providers: {} }
  if (existsSync(configPath)) {
    try {
      existing = JSON.parse(readFileSync(configPath, 'utf-8'))
    } catch {
      // ignore parse errors
    }
  }

  const providersRecord = (existing.providers as Record<string, unknown>) || {}
  providersRecord['x-llm-gateway'] = {
    baseUrl: url,
    api: 'anthropic-messages',
    ...(apiKey ? { apiKey } : {}),
    models: models.map((m) => ({ id: m, name: m })),
  }
  existing.providers = providersRecord

  if (!existsSync(configDir)) mkdirSync(configDir, { recursive: true })
  writeFileSync(configPath, JSON.stringify(existing, null, 2) + '\n')
  p.log.success(`~/.pi/agent/models.json 已${existsSync(configPath) ? '更新' : '生成'}`)
}

async function configureCodex(url: string, apiKey: string) {
  const envContent = [
    '# x-llm-gateway 配置 (添加到 ~/.zshrc 或 ~/.bashrc)',
    `export OPENAI_API_BASE="${url}/api/v1"`,
    apiKey ? `export OPENAI_API_KEY="${apiKey}"` : '# export OPENAI_API_KEY="sk-your-key"',
    '',
  ].join('\n')

  p.log.info('Codex 配置（请添加到 shell profile）:')
  console.log(envContent)

  // 也写入一个 .env 文件
  const envPath = join(process.cwd(), '.env.xgate')
  writeFileSync(envPath, envContent)
  p.log.success('.env.xgate 已生成')
}

program.parse()
