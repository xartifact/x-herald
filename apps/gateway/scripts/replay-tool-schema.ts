#!/usr/bin/env bun
/**
 * Tool schema sanitizer 诊断脚本 —— 手动运维/排障工具，不是自动化测试，不跑在 bun:test 下。
 *
 * 用途：当某个 Provider 因为 tool schema 拒绝请求（400），用这个脚本快速定位是哪个 tool、
 * sanitizeToolSchema 处理前后差异是什么，而不用每次手写 psql + node 脚本。
 *
 * 用法：
 *   # 从数据库里某条失败的 request_log 提取所有 tool schema，跑 sanitizer，打印发生变化的 tool
 *   cd apps/gateway && bun run --env-file=../../.env.local --env-file=../../.env \
 *     scripts/replay-tool-schema.ts --request-log <request_log_id>
 *
 *   # 只对本地 JSON 文件里的 tools 数组（或单个 schema 对象）跑 sanitizer，不需要数据库连接
 *   bun run scripts/replay-tool-schema.ts --file ./some-tools.json
 *
 * 输出：对每个因 sanitizer 而变化的 tool，打印 before/after 的 JSON diff；未变化的 tool 不打印。
 * 找到新的 Provider 兼容性问题后，去 src/gateway/transformer/shared/tool-schema-sanitizer.ts 里
 * 加规则，再跑一遍这个脚本确认变化符合预期。
 */
import { sanitizeToolSchema } from '../src/gateway/transformer/shared/tool-schema-sanitizer'

interface ToolLike {
  name?: string
  function?: { name?: string; parameters?: unknown }
  input_schema?: unknown
}

function extractTools(body: unknown): ToolLike[] {
  if (Array.isArray(body)) return body as ToolLike[]
  if (body && typeof body === 'object' && Array.isArray((body as { tools?: unknown }).tools)) {
    return (body as { tools: ToolLike[] }).tools
  }
  return []
}

function toolName(tool: ToolLike): string {
  return tool.function?.name || tool.name || '(unnamed)'
}

function toolSchema(tool: ToolLike): unknown {
  return tool.function?.parameters ?? tool.input_schema
}

function printDiff(name: string, before: unknown, after: unknown): void {
  console.log(`\n=== ${name} ===`)
  console.log('--- before ---')
  console.log(JSON.stringify(before, null, 2))
  console.log('--- after ---')
  console.log(JSON.stringify(after, null, 2))
}

function runDiff(tools: ToolLike[]): void {
  let changed = 0
  for (const tool of tools) {
    const schema = toolSchema(tool)
    if (!schema) continue
    const sanitized = sanitizeToolSchema(schema)
    if (JSON.stringify(sanitized) !== JSON.stringify(schema)) {
      changed++
      printDiff(toolName(tool), schema, sanitized)
    }
  }
  console.log(`\n共 ${tools.length} 个 tool，${changed} 个被 sanitizer 修改。`)
}

async function runFromFile(filePath: string): Promise<void> {
  const raw = await Bun.file(filePath).json()
  const tools = extractTools(raw)
  if (tools.length === 0) {
    // 兼容直接传单个 schema 对象的情况
    const sanitized = sanitizeToolSchema(raw)
    printDiff('(单个 schema)', raw, sanitized)
    return
  }
  runDiff(tools)
}

async function runFromRequestLog(requestLogId: string): Promise<void> {
  const { loadConfig } = await import('../src/config/loader')
  const { createDatabase, getDatabase, closeDatabase } = await import('../src/db/client')
  const { requestAttempts, eq } = await import('@xartifact/x-herald-db')

  const config = loadConfig()
  await createDatabase(config.database)
  const db = getDatabase()

  const rows = await db
    .select({ transformedRequestBody: requestAttempts.transformedRequestBody })
    .from(requestAttempts)
    .where(eq(requestAttempts.requestLogId, requestLogId))

  if (rows.length === 0) {
    console.error(`未找到 request_log_id = ${requestLogId} 对应的 request_attempts 记录`)
    await closeDatabase()
    process.exit(1)
  }

  for (const row of rows) {
    const tools = extractTools(row.transformedRequestBody)
    if (tools.length === 0) continue
    runDiff(tools)
  }

  await closeDatabase()
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const requestLogIdx = args.indexOf('--request-log')
  const fileIdx = args.indexOf('--file')

  if (requestLogIdx !== -1) {
    await runFromRequestLog(args[requestLogIdx + 1])
    return
  }
  if (fileIdx !== -1) {
    await runFromFile(args[fileIdx + 1])
    return
  }

  console.error(
    '用法: bun run scripts/replay-tool-schema.ts --request-log <uuid> | --file <path.json>',
  )
  process.exit(1)
}

main()
