import { readFileSync } from 'node:fs'

import { GatewayClient } from './client'
import type { OutputFormat } from './output'
import type { InvocationDeps, SpecCommand, SpecOption } from './spec'

/** Group → admin API mount path. */
export const MOUNTS: Record<string, string> = {
  providers: '/api/providers',
  groups: '/api/model-groups',
  instances: '/api/model-groups',
  keys: '/api/keys',
  logs: '/api/logs',
  metrics: '/api/metrics',
  costs: '/api/costs',
  cb: '/api/circuit-breaker',
  access: '/api/access-models',
  rules: '/api/access-models',
  traces: '/api/routing-traces',
  potential: '/api/potential-models',
  settings: '/api/settings',
  workspaces: '/api/workspaces',
  config: '/api/config',
  ai: '/api/ai',
  auth: '/api/auth',
  health: '/api/health',
  console: '/api/console-logs',
  overview: '/api/route-overview',
}

export interface BuiltRequest {
  url: string
  method: string
  body?: string
  asText: boolean
}

/** Build the concrete request for one invocation; flags left undefined are omitted. */
export function buildRequest(
  spec: SpecCommand,
  params: Record<string, unknown>,
  opts: Record<string, unknown>,
  baseUrl: string,
): BuiltRequest {
  const mount = MOUNTS[spec.group]
  if (!mount) throw new Error(`No mount path registered for group '${spec.group}'`)
  const path =
    mount +
    spec.path.replace(/:([A-Za-z0-9_]+)/g, (_m, key: string) => {
      const value = params[key]
      if (value === undefined || value === null || value === '') {
        throw new Error(`Missing required argument <${key}>`)
      }
      return encodeURIComponent(String(value))
    })
  const url = new URL(path, baseUrl)
  // Hono mounts match the exact path: `/api/providers/` is a 404 while `/api/providers` is not.
  url.pathname = url.pathname.replace(/\/{2,}/g, '/').replace(/(.)\/$/, '$1')

  const body: Record<string, unknown> = {}
  let rawBody: string | undefined
  for (const option of spec.options ?? []) {
    const raw = opts[camel(option.name)]
    if (raw === undefined) continue
    if (option.in === 'query') url.searchParams.set(option.name, String(raw))
    else if (option.name === 'file') rawBody = readBodyFile(String(raw))
    else body[camel(option.name)] = parseLoose(raw)
  }
  return {
    url: url.toString(),
    method: spec.method,
    body:
      spec.method === 'GET' || spec.method === 'DELETE' || spec.noBody
        ? undefined
        : (rawBody ?? JSON.stringify(body)),
    asText: spec.response?.shape === 'text',
  }
}

/**
 * Read a whole request body from a file (`-` = stdin) and validate it is JSON.
 *
 * Used by `config import`, whose body is the export document itself rather than a
 * wrapper object — sending `{file: ...}` would be rejected by the server.
 */
function readBodyFile(path: string): string {
  const text = path === '-' ? readFileSync(0, 'utf-8') : readFileSync(path, 'utf-8')
  try {
    JSON.parse(text)
  } catch {
    throw new Error(`File is not valid JSON: ${path}`)
  }
  return text
}

/** Accept JSON literals in body flags; keep plain strings as strings. */
function parseLoose(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (!/^[[{"]|^(true|false|null|-?\d)/.test(trimmed)) return value
  try {
    return JSON.parse(trimmed)
  } catch {
    return value
  }
}

function camel(kebab: string): string {
  return kebab.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase())
}

/** Map the CLI response shape onto what the server actually returned. */
export function unwrap(body: unknown, shape: SpecResponseShape = 'payload'): unknown {
  if (shape !== 'payload') return body
  if (body && typeof body === 'object' && 'data' in body) return body.data
  return body
}

type SpecResponseShape = NonNullable<SpecCommand['response']>['shape']

/** Execute one spec command and print the result in the requested format. */
export async function executeSpec(
  spec: SpecCommand,
  params: Record<string, unknown>,
  opts: Record<string, unknown>,
  deps: InvocationDeps,
): Promise<void> {
  const built = buildRequest(spec, params, opts, deps.baseUrl())
  const format = (opts.format as OutputFormat | undefined) ?? 'json'
  if (opts.dryRun === true || deps.dryRun()) {
    deps.print({
      method: built.method,
      url: built.url,
      body: built.body ? JSON.parse(built.body) : undefined,
    })
    return
  }
  const client = new GatewayClient({ baseUrl: deps.baseUrl(), token: deps.token() })
  const result = await client.requestRaw(built.url, {
    method: built.method,
    body: built.body,
    accept: built.asText ? 'text/event-stream, application/json' : undefined,
    asText: built.asText,
  })
  if (built.asText) {
    process.stdout.write(result.text + (result.text.endsWith('\n') ? '' : '\n'))
    return
  }
  deps.print(unwrap(result.json, spec.response?.shape))
  void format
}

/** Option value helpers shared by the spec table. */
export const query = (name: string, desc?: string): SpecOption => ({
  name,
  in: 'query',
  takesValue: true,
  desc,
})
export const body = (name: string, desc?: string): SpecOption => ({
  name,
  in: 'body',
  takesValue: true,
  desc,
})
export const bodyJson = (name: string, desc?: string): SpecOption => ({
  name,
  in: 'body',
  takesValue: true,
  desc: desc ? `${desc} (JSON)` : 'JSON',
})
