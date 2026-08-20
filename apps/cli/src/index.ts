#!/usr/bin/env bun
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { Command } from 'commander'
import * as p from '@clack/prompts'
import { GatewayClient } from './client'

const program = new Command()

program
  .name('x-herald')
  .description('x-herald management CLI')
  .version('0.1.0')
  .option('-u, --url <url>', 'API base URL', process.env.X_HERALD_URL || 'http://localhost:3000')
  .option('-k, --api-key <key>', 'API key', process.env.X_HERALD_API_KEY)

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

// Model instances config (read-modify-write via admin API)
const instances = program.command('instances').description('Manage model instances config')

function getClient() {
  return new GatewayClient({ baseUrl: program.opts().url, apiKey: program.opts().apiKey })
}

async function findInstance(idOrName: string) {
  const client = getClient()
  const instances = await client.listInstances()
  const found = instances.find(
    (i) => i.id === idOrName || i.name === idOrName || i.actualModelName === idOrName,
  )
  if (!found) throw new Error(`No model instance found for "${idOrName}"`)
  return found
}

function parseJsonValue(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new Error(`Value is not valid JSON: ${value}`)
  }
}

instances
  .command('list')
  .description('List all model instances')
  .action(async () => {
    const data = await getClient().listInstances()
    console.table(
      data.map((i) => ({
        ID: i.id,
        Name: i.name,
        'Actual Model': i.actualModelName ?? '',
        Provider: i.providerName ?? '',
        Enabled: i.enabled,
      })),
    )
  })

instances
  .command('config <idOrName>')
  .description('Show the full config of a model instance (JSON)')
  .action(async (idOrName: string) => {
    const inst = await findInstance(idOrName)
    console.log(JSON.stringify(inst.config ?? {}, null, 2))
  })

instances
  .command('config-get <idOrName> <key>')
  .description('Show a single config key of a model instance')
  .action(async (idOrName: string, key: string) => {
    const inst = await findInstance(idOrName)
    const val = inst.config?.[key]
    if (val === undefined) {
      console.log(`(key "${key}" is not set)`)
      return
    }
    console.log(JSON.stringify(val, null, 2))
  })

instances
  .command('config-set <idOrName> <key> <json>')
  .description('Set a config key (read-modify-write merge); <json> is e.g. {"developer":"system"}')
  .action(async (idOrName: string, key: string, json: string) => {
    const inst = await findInstance(idOrName)
    const value = parseJsonValue(json)
    const config = { ...(inst.config ?? {}), [key]: value }
    await getClient().updateInstance(inst.id, { config })
    console.log(`config.${key} set on ${inst.name} (id ${inst.id})`)
  })

instances
  .command('config-unset <idOrName> <key>')
  .description('Remove a config key from a model instance (merge; undefined removes)')
  .action(async (idOrName: string, key: string) => {
    const inst = await findInstance(idOrName)
    const config = { ...(inst.config ?? {}) }
    delete config[key]
    await getClient().updateInstance(inst.id, { config })
    console.log(`config.${key} removed from ${inst.name} (id ${inst.id})`)
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
    if (Array.isArray(status.status)) {
      console.table(
        status.status.map((c: { name: string; status: string; message?: string }) => ({
          Name: c.name,
          Status: c.status,
          Message: c.message || '',
        })),
      )
    }
  })

// Configure
const configure = program.command('configure').description('配置 AI 工具使用 x-herald')

configure.action(async () => {
  p.intro('x-herald 配置向导')

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
      'x-herald': {
        npm: '@ai-sdk/openai-compatible',
        name: 'x-herald',
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
  providersRecord['x-herald'] = {
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
    '# x-herald 配置 (添加到 ~/.zshrc 或 ~/.bashrc)',
    `export OPENAI_API_BASE="${url}/api/v1"`,
    apiKey ? `export OPENAI_API_KEY="${apiKey}"` : '# export OPENAI_API_KEY="sk-your-key"',
    '',
  ].join('\n')

  p.log.info('Codex 配置（请添加到 shell profile）:')
  console.log(envContent)

  // 也写入一个 .env 文件
  const envPath = join(process.cwd(), '.env.x-herald')
  writeFileSync(envPath, envContent)
  p.log.success('.env.x-herald 已生成')
}

program.parse()
