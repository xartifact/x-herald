#!/usr/bin/env bun
import { Command } from 'commander'

import { GatewayClient, GatewayError } from './client'
import { clearCliToken, configPath, loadCliConfig, saveCliConfig } from './config'
import { runConfigureWizard } from './configure'
import { resolveCredentials } from './credentials'
import { executeSpec, unwrap } from './executor'
import { printResult, report } from './output'
import { SPEC_COMMANDS } from './spec-commands'
import { MOUNTS } from './executor'
import { registerSpecCommands } from './spec'
import type { InvocationDeps } from './spec'

const program = new Command()

program
  .name('x-herald')
  .description(
    [
      'x-herald 网关管理 CLI（覆盖全部管理端点）。',
      '认证三级回退：--token > $X_HERALD_TOKEN > `x-herald auth login` 落盘的 token。',
      '输出默认 JSON（适合 agent 与 jq）；`--format table` 仅供人看。',
    ].join('\n'),
  )
  .version('0.2.0')
  .option('-u, --url <url>', 'API base URL（默认 $X_HERALD_URL 或 http://localhost:3000）')
  .option('-t, --token <token>', '管理员 JWT（默认 $X_HERALD_TOKEN 或配置文件）')
  .option('-k, --api-key <key>', '虚拟密钥，仅用于 /api/v1（默认 $X_HERALD_API_KEY）')
  .option('-f, --format <format>', 'json | table | raw（默认 json）')
  .option('--dry-run', '只打印将发出的请求，不执行')

function credentials() {
  const opts = program.opts()
  return resolveCredentials({ flagUrl: opts.url, flagToken: opts.token, flagApiKey: opts.apiKey })
}

function format(): 'json' | 'table' | 'raw' {
  const value = program.opts().format
  return value === 'table' || value === 'raw' ? value : 'json'
}

const deps: InvocationDeps = {
  baseUrl: () => credentials().baseUrl,
  token: () => credentials().token,
  dryRun: () => Boolean(program.opts().dryRun),
  print: (data) => printResult(data, { format: format() }),
}

// ── auth: login persists a token; the spec table's raw login is skipped ─────
const auth = program.command('auth').description('管理员登录与身份')

auth
  .command('login')
  .description('用管理员密码换取 JWT 并落盘（~/.config/x-herald/config.json，权限 0600）')
  .option('-p, --password <password>', '管理员密码（省略则读 $X_HERALD_ADMIN_PASSWORD）')
  .option('--no-save', '只打印 token，不写文件')
  .action(async (opts: { password?: string; save: boolean }) => {
    const password = opts.password ?? process.env.X_HERALD_ADMIN_PASSWORD
    if (!password) throw new Error('缺少密码：用 --password 或 $X_HERALD_ADMIN_PASSWORD')
    const creds = credentials()
    const result = await new GatewayClient({ baseUrl: creds.baseUrl }).login(password)
    if (!opts.save) {
      process.stdout.write(result.token + '\n')
      return
    }
    const expiresAt = result.expiresIn
      ? Math.floor(Date.now() / 1000) + result.expiresIn
      : undefined
    saveCliConfig({ url: creds.baseUrl, token: result.token, expiresAt })
    report(`已登录 ${creds.baseUrl}；token 保存到 ${configPath()}（权限 0600）`)
  })

auth
  .command('whoami')
  .description('显示当前凭据来源与身份（不打印 token 本身）')
  .action(async () => {
    const creds = credentials()
    const stored = loadCliConfig()
    const identity = creds.token
      ? await new GatewayClient({ baseUrl: creds.baseUrl, token: creds.token }).whoami()
      : null
    printResult(
      {
        url: creds.baseUrl,
        tokenSource: creds.tokenSource ?? 'none',
        hasApiKey: Boolean(creds.apiKey),
        storedUrl: stored.url ?? null,
        expiresAt: stored.expiresAt ? new Date(stored.expiresAt * 1000).toISOString() : null,
        identity,
      },
      { format: format() },
    )
  })

auth
  .command('logout')
  .description('删除本地保存的 token')
  .action(() => {
    clearCliToken()
    report(`已清除 ${configPath()} 中的 token`)
  })

// ── every other admin endpoint, generated from the spec table ───────────────
registerSpecCommands(
  program,
  SPEC_COMMANDS.filter((spec) => spec.group !== 'auth'),
  MOUNTS,
  deps,
  executeSpec,
)

// ── escape hatch for endpoints added after this release ─────────────────────
program
  .command('api <method> <path>')
  .description('直接调用任意端点，如 `api GET /api/providers`（覆盖未来新增端点）')
  .option('-b, --body <json>', 'JSON 请求体')
  .option('--query <k=v>', '查询参数，可重复', collect, [])
  .action(async (method: string, path: string, opts: { body?: string; query: string[] }) => {
    const creds = credentials()
    const url = new URL(path.startsWith('/') ? path : `/${path}`, creds.baseUrl)
    for (const pair of opts.query) {
      const [key, ...rest] = pair.split('=')
      url.searchParams.set(key, rest.join('='))
    }
    const upper = method.toUpperCase()
    const payload =
      upper === 'GET' || upper === 'DELETE'
        ? undefined
        : JSON.stringify(safeJson(opts.body ?? '{}'))
    if (program.opts().dryRun) {
      printResult(
        { method: upper, url: url.toString(), body: payload ? JSON.parse(payload) : undefined },
        { format: 'json' },
      )
      return
    }
    const result = await new GatewayClient({
      baseUrl: creds.baseUrl,
      token: creds.token,
    }).requestRaw(url.toString(), { method: upper, body: payload })
    printResult(unwrap(result.json), { format: format() })
  })

function collect(value: string, previous: string[]): string[] {
  return [...previous, value]
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

// ── top-level health shortcut, kept because it is the one command operators type blind ──
program
  .command('ping')
  .description('健康检查（等价 `x-herald health health`）')
  .action(async () => {
    const creds = credentials()
    const result = await new GatewayClient({
      baseUrl: creds.baseUrl,
      token: creds.token,
    }).requestRaw(`${creds.baseUrl}/api/health`, { method: 'GET' })
    printResult(unwrap(result.json, 'envelope'), { format: format() })
  })

// ── configure ───────────────────────────────────────────────────────────────
program
  .command('configure')
  .description('配置 AI 编码工具（OpenCode / Claude Code / Pi / Codex）使用本网关')
  .action(async () => {
    await runConfigureWizard(credentials().baseUrl)
  })

try {
  await program.parseAsync(process.argv)
} catch (error) {
  if (error instanceof GatewayError && error.status === 401) {
    report(`${error.message}\n提示：先运行 \`x-herald auth login\`。`)
  } else {
    report(error instanceof Error ? error.message : String(error))
  }
  process.exit(1)
}
