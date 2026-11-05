import type { Command } from 'commander'

/** One CLI flag that maps to either a query parameter or a JSON body field. */
export interface SpecOption {
  /** Long flag name, kebab-case (commander turns it into `--name`). */
  name: string
  /** Where the value goes. */
  in: 'query' | 'body'
  /** Human description; also documents accepted values for agents. */
  desc?: string
  /** Rendered as `<value>`; otherwise the flag is a boolean. */
  takesValue?: boolean
}

/** How a command's response should be unwrapped before printing. */
export interface SpecResponse {
  /**
   * `payload` (default): print the `data` field of the `{success,data}` envelope.
   * `envelope`: print the whole JSON body (list endpoints that carry nextCursor).
   * `text`: print the raw response body (export, SSE streams).
   */
  shape?: 'payload' | 'envelope' | 'text'
}

export interface SpecCommand {
  group: string
  /** Subcommand name, e.g. `list`. */
  name: string
  /** Positional arguments in order, e.g. `['id']` renders `<id>`. */
  args?: string[]
  description: string
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  /** Path template using `:arg` placeholders, appended to the group's mount path. */
  path: string
  options?: SpecOption[]
  response?: SpecResponse
  /** Send no body even for POST/PATCH (server tolerates an empty body). */
  noBody?: boolean
}

/** Everything a spec invocation needs from the environment. */
export interface InvocationDeps {
  baseUrl(): string
  token(): string | undefined
  print(data: unknown): void
  dryRun(): boolean
}

/**
 * Register every spec command under its group, creating the group command if absent.
 *
 * Each subcommand also gets `--format` and `--dry-run`, so they read naturally after
 * the subcommand (`x-herald providers list --format json`) rather than before it.
 */
export function registerSpecCommands(
  program: Command,
  specs: SpecCommand[],
  mounts: Record<string, string>,
  deps: InvocationDeps,
  execute: (
    spec: SpecCommand,
    params: Record<string, unknown>,
    opts: Record<string, unknown>,
    deps: InvocationDeps,
  ) => Promise<void>,
): void {
  const groups = new Map<string, Command>()
  for (const spec of specs) {
    const mount = mounts[spec.group]
    if (!mount) throw new Error(`No mount path registered for group '${spec.group}'`)
    let group = groups.get(spec.group)
    if (!group) {
      group = program.command(spec.group).description(groupDescription(spec.group))
      groups.set(spec.group, group)
    }
    const argList = (spec.args ?? []).map((a) => `<${a}>`).join(' ')
    const cmd = group
      .command(`${spec.name}${argList ? ' ' + argList : ''}`)
      .description(spec.description)
    for (const option of spec.options ?? []) {
      const valueName = option.name.replace(/-/g, '')
      const flag = `--${option.name}${option.takesValue ? ` <${valueName}>` : ''}`
      cmd.option(flag, option.desc ? `${option.desc} [${option.in}]` : `[${option.in}]`)
    }
    cmd
      .option('-f, --format <format>', 'json | table | raw（默认 json）', 'json')
      .option('--dry-run', '只打印将发出的请求，不执行')
      // commander passes declared positional args then the options object — unless the
      // command declares no arguments, in which case the options object is the only arg.
      .action(async (...actionArgs: unknown[]) => {
        const args: string[] = spec.args ?? []
        const optionValues = optionValuesOf(actionArgs[actionArgs.length - 1])
        const params: Record<string, unknown> = {}
        args.forEach((argName, i) => {
          params[argName] = actionArgs[i]
        })
        await execute(spec, params, optionValues, deps)
      })
  }
}

/** Short group descriptions, so `x-herald --help` explains intent without reading code. */
const GROUP_DESCRIPTIONS: Record<string, string> = {
  providers: '上游供应商（协议、密钥、模型列表、thinking 映射）',
  groups: '模型组（对外模型名、能力、类别）',
  instances: '模型实例（供应商下的具体模型、配置、权重）',
  keys: '虚拟密钥（代理鉴权、限流、用量）',
  logs: '请求日志（检索、统计、清理、分析）',
  metrics: '实例指标、供应商质量、异常检测',
  costs: '成本核算与定价',
  cb: '熔断器（状态、事件、手动恢复/触发）',
  access: '接入模型（客户端可见的模型）',
  rules: '路由版本（每个接入模型一张规则图）',
  traces: '路由追踪（每次请求的路由决策）',
  potential: '潜在模型（未接入但被请求过的模型）',
  settings: '系统设置与分类器提示词',
  workspaces: '工作区（配置隔离边界）',
  config: '配置导入导出',
  ai: 'AI 辅助（诊断、配置生成、日志分析）',
  health: '健康与就绪探针',
  console: '实时控制台日志',
  overview: '路由总览',
}

function groupDescription(group: string): string {
  return GROUP_DESCRIPTIONS[group] ?? group
}

/**
 * Read option values from commander's action arguments.
 *
 * commander always passes a Command instance as the final action argument (never the
 * options object itself); the parsed options live behind `command.opts()`. Declared
 * positional arguments come first, so the instance is the last value either way.
 */
function optionValuesOf(last: unknown): Record<string, unknown> {
  if (isCommandLike(last)) return last.opts()
  return {}
}

/** commander's Command instances carry `.opts()`; plain option objects never do. */
function isCommandLike(value: unknown): value is { opts: () => Record<string, unknown> } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'opts' in value &&
    typeof value.opts === 'function'
  )
}
