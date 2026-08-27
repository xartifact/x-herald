/**
 * `/x-herald` admin command family. Shared handlers; the runtime injects
 * both the extension API (for `registerProvider`) and the command context
 * (for UI), so neither is referenced statically here.
 *
 * Dependencies (config/gateway/diagnose) are injectable so tests can drive
 * the handlers without `mock.module` — bun's `mock.module` replaces modules
 * process-wide and `mock.restore()` does NOT undo it, leaking mocks into
 * other test files running in the same worker.
 */

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

import { resolveProviderConfig } from './config.ts'
import { diagnoseEntries } from './diagnose.ts'
import {
  buildRoleConfigSnippet,
  DEFAULT_THINKING_SUFFIX,
  roleSnippetSummary,
} from './model-roles.ts'
import { buildProviderConfig, discoverModels, fetchGatewayModels } from './gateway.ts'
import { EXTENSION_VERSION } from './version.ts'
import { PROVIDER_ID, PROVIDER_NAME } from './types.ts'

// ---------------------------------------------------------------------------
// Injectable dependencies
// ---------------------------------------------------------------------------

export interface CommandDeps {
  resolveProviderConfig: typeof resolveProviderConfig
  fetchGatewayModels: typeof fetchGatewayModels
  discoverModels: typeof discoverModels
  buildProviderConfig: typeof buildProviderConfig
  diagnoseEntries: typeof diagnoseEntries
}

const defaultDeps: CommandDeps = {
  resolveProviderConfig,
  fetchGatewayModels,
  discoverModels,
  buildProviderConfig,
  diagnoseEntries,
}

// ---------------------------------------------------------------------------
// Sub-command handlers
// ---------------------------------------------------------------------------

async function handleRefresh(
  pi: ExtensionAPI,
  ctx: ExtensionCommandContext,
  deps: CommandDeps,
): Promise<void> {
  const { baseUrl, apiKey, api } = await deps.resolveProviderConfig()
  if (!apiKey) {
    ctx.ui.notify('No API key configured.', 'error')
    return
  }
  try {
    // Re-register with the same hooks; pi merges, so the dynamic
    // discovery hooks registered at startup are preserved.
    const fresh = await deps.discoverModels(apiKey)
    pi.registerProvider(
      PROVIDER_ID,
      deps.buildProviderConfig({
        name: PROVIDER_NAME,
        baseUrl,
        apiKey,
        api,
        models: fresh,
      }),
    )
    ctx.ui.notify(`Refreshed ${fresh.length} models from ${baseUrl}`, 'info')
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    ctx.ui.notify(`Refresh failed: ${msg}`, 'error')
  }
}
async function handleDiagnose(ctx: ExtensionCommandContext, deps: CommandDeps): Promise<void> {
  const { baseUrl, apiKey } = await deps.resolveProviderConfig()
  if (!apiKey) {
    ctx.ui.notify('No API key configured.', 'error')
    return
  }
  let entries
  try {
    entries = await deps.fetchGatewayModels(baseUrl, apiKey)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    ctx.ui.notify(`Diagnose failed: ${msg}`, 'error')
    return
  }
  const report = deps.diagnoseEntries(entries, baseUrl)
  if (report.total === 0) {
    ctx.ui.notify('Gateway returned an empty list.', 'warning')
    return
  }
  // Long report → widget above editor; the summary goes to a notification.
  ctx.ui.setWidget('x-herald-diagnose', report.lines)
  ctx.ui.notify(
    report.fail === 0
      ? `Diagnose: ${report.pass}/${report.total} pass — see widget above editor`
      : `Diagnose: ${report.fail}/${report.total} FAIL — see widget above editor`,
    report.fail === 0 ? 'info' : 'error',
  )
}
async function handleModels(ctx: ExtensionCommandContext, deps: CommandDeps): Promise<void> {
  const { baseUrl, apiKey } = await deps.resolveProviderConfig()
  if (!apiKey) {
    ctx.ui.notify('No API key configured.', 'error')
    return
  }
  let entries
  try {
    entries = await deps.fetchGatewayModels(baseUrl, apiKey)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    ctx.ui.notify(`Models fetch failed: ${msg}`, 'error')
    return
  }
  if (entries.length === 0) {
    ctx.ui.notify('Gateway returned an empty list.', 'warning')
    return
  }
  // 每个模型一行：id + context window + max output + 能力标记。
  const lines = [`x-herald models — ${baseUrl}`, `models: ${entries.length}`, '']
  for (const m of entries) {
    const caps = m.capabilities ?? {}
    const flags = [
      caps.vision ? 'vision' : null,
      caps.reasoning ? 'reasoning' : null,
      caps.streaming ? 'streaming' : null,
    ]
      .filter((f): f is string => f !== null)
      .join(', ')
    lines.push(
      `${m.id.padEnd(28)} ctx ${String(m.context_window ?? '-').padStart(7)}  ` +
        `max ${String(m.max_output_tokens ?? '-').padStart(7)}${flags ? `  ${flags}` : ''}`,
    )
  }
  ctx.ui.setWidget('x-herald-models', lines)
  ctx.ui.notify(`Models: ${entries.length} from ${baseUrl} — see widget above editor`, 'info')
}

async function handleSetup(ctx: ExtensionCommandContext, deps: CommandDeps): Promise<void> {
  const { baseUrl, apiKey } = await deps.resolveProviderConfig()
  if (!apiKey) {
    ctx.ui.notify('No API key configured.', 'error')
    return
  }
  let entries
  try {
    entries = await deps.fetchGatewayModels(baseUrl, apiKey)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    ctx.ui.notify(`Setup failed: ${msg}`, 'error')
    return
  }
  if (entries.length === 0) {
    ctx.ui.notify('Gateway returned an empty list.', 'warning')
    return
  }
  const snippet = buildRoleConfigSnippet(entries)
  const { head, tail } = roleSnippetSummary(snippet)
  const lines = [head, 'modelRoles:', ...snippet.lines, ...tail]
  ctx.ui.setWidget('x-herald-setup', lines)
  ctx.ui.notify(
    snippet.unresolved.length > 0
      ? `Setup: ${snippet.resolved.length} roles mapped, ${snippet.unresolved.length} missing — see widget`
      : `Setup: ${snippet.resolved.length} roles mapped (all :${DEFAULT_THINKING_SUFFIX}) — see widget`,
    'info',
  )
}
function handleHelp(ctx: ExtensionCommandContext): void {
  ctx.ui.notify(
    [
      'x-herald sub-commands:',
      '  /x-herald refresh   re-fetch /models and re-register the provider',
      '  /x-herald models    list models from the gateway catalogue (widget)',
      '  /x-herald setup     render omp modelRoles for virtual models (all :xhigh)',
      '  /x-herald diagnose  validate /models against the v1 schema (widget)',
      '  /x-herald version   show extension version',
      '  /x-herald help      show this help',
    ].join('\n'),
    'info',
  )
}
function handleVersion(ctx: ExtensionCommandContext): void {
  ctx.ui.notify(`${PROVIDER_NAME} extension v${EXTENSION_VERSION} [${PROVIDER_ID}]`, 'info')
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerXGateCommand(pi: ExtensionAPI, deps: CommandDeps = defaultDeps): void {
  pi.registerCommand('x-herald', {
    description: 'x-herald admin: refresh | setup | models | diagnose | help',
    getArgumentCompletions(prefix) {
      const items = [
        {
          value: 'refresh',
          label: 'refresh',
          description: 'Re-fetch /models and re-register the provider',
        },
        {
          value: 'setup',
          label: 'setup',
          description: 'Render omp modelRoles for virtual models (all :xhigh)',
        },
        {
          value: 'models',
          label: 'models',
          description: 'List models from the gateway catalogue (widget)',
        },
        {
          value: 'diagnose',
          label: 'diagnose',
          description: 'Validate /models against the v1 schema',
        },
        { value: 'version', label: 'version', description: 'Show extension version' },
        { value: 'help', label: 'help', description: 'Show sub-command help' },
      ]
      const filtered = items.filter((i) => i.value.startsWith(prefix))
      return filtered.length > 0 ? filtered : null
    },
    handler: async (args, ctx) => {
      const sub = (args.trim().split(/\s+/)[0] ?? '') as string
      switch (sub) {
        case 'refresh':
          await handleRefresh(pi, ctx, deps)
          return
        case 'setup':
          await handleSetup(ctx, deps)
          return
        case 'models':
          await handleModels(ctx, deps)
          return
        case 'diagnose':
          await handleDiagnose(ctx, deps)
          return
        case 'version':
          handleVersion(ctx)
          return
        case 'help':
        case '':
          handleHelp(ctx)
          return
        default:
          ctx.ui.notify(`Unknown sub-command: "${sub}". Try /x-herald help.`, 'warning')
          handleHelp(ctx)
      }
    },
  })
}
