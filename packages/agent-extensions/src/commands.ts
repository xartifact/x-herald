/**
 * `/x-gate` admin command family. Shared handlers; the runtime injects
 * both the extension API (for `registerProvider`) and the command context
 * (for UI), so neither is referenced statically here.
 */

import type { ExtensionAPI, ExtensionCommandContext } from '@earendil-works/pi-coding-agent'

import { resolveProviderConfig } from './config.ts'
import { diagnoseEntries } from './diagnose.ts'
import { buildProviderConfig, discoverModels, fetchGatewayModels } from './gateway.ts'
import { EXTENSION_VERSION } from './version.ts'
import { PROVIDER_ID, PROVIDER_NAME } from './types.ts'

// ---------------------------------------------------------------------------
// Sub-command handlers
// ---------------------------------------------------------------------------

async function handleRefresh(pi: ExtensionAPI, ctx: ExtensionCommandContext): Promise<void> {
  const { baseUrl, apiKey, api } = await resolveProviderConfig()
  if (!apiKey) {
    ctx.ui.notify('No API key configured.', 'error')
    return
  }
  try {
    // Re-register with the same hooks; pi merges, so the dynamic
    // discovery hooks registered at startup are preserved.
    const fresh = await discoverModels(apiKey)
    pi.registerProvider(
      PROVIDER_ID,
      buildProviderConfig({
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
async function handleDiagnose(ctx: ExtensionCommandContext): Promise<void> {
  const { baseUrl, apiKey } = await resolveProviderConfig()
  if (!apiKey) {
    ctx.ui.notify('No API key configured.', 'error')
    return
  }
  let entries
  try {
    entries = await fetchGatewayModels(baseUrl, apiKey)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    ctx.ui.notify(`Diagnose failed: ${msg}`, 'error')
    return
  }
  const report = diagnoseEntries(entries, baseUrl)
  if (report.total === 0) {
    ctx.ui.notify('Gateway returned an empty list.', 'warning')
    return
  }
  // Long report → widget above editor; the summary goes to a notification.
  ctx.ui.setWidget('x-gate-diagnose', report.lines)
  ctx.ui.notify(
    report.fail === 0
      ? `Diagnose: ${report.pass}/${report.total} pass — see widget above editor`
      : `Diagnose: ${report.fail}/${report.total} FAIL — see widget above editor`,
    report.fail === 0 ? 'info' : 'error',
  )
}

function handleHelp(ctx: ExtensionCommandContext): void {
  ctx.ui.notify(
    [
      'x-gate sub-commands:',
      '  /x-gate refresh   re-fetch /models and re-register the provider',
      '  /x-gate diagnose  validate /models against the v1 schema (widget)',
      '  /x-gate version   show extension version',
      '  /x-gate help      show this help',
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

export function registerXGateCommand(pi: ExtensionAPI): void {
  pi.registerCommand('x-gate', {
    description: 'x-llm-gateway admin: refresh | diagnose | help',
    getArgumentCompletions(prefix) {
      const items = [
        {
          value: 'refresh',
          label: 'refresh',
          description: 'Re-fetch /models and re-register the provider',
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
          await handleRefresh(pi, ctx)
          return
        case 'diagnose':
          await handleDiagnose(ctx)
          return
        case 'version':
          handleVersion(ctx)
          return
        case 'help':
        case '':
          handleHelp(ctx)
          return
        default:
          ctx.ui.notify(`Unknown sub-command: "${sub}". Try /x-gate help.`, 'warning')
          handleHelp(ctx)
      }
    },
  })
}
