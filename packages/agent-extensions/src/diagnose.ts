/**
 * Schema-level validation for the live `/models` response.
 *
 * Pure logic — emits a list of strings; the caller decides where to render
 * them (widget, notify, file dump). Shared by both runtimes.
 */

import type { GatewayCapabilities, GatewayModelEntry } from './types.ts'

export interface DiagnoseReport {
  lines: string[]
  pass: number
  fail: number
  total: number
}

export const REQUIRED_MODEL = ['id', 'context_window', 'max_output_tokens', 'capabilities'] as const
export const REQUIRED_CAPS = ['vision', 'reasoning'] as const

// Fields enumerated in schemas/v1-models.schema.json. Anything else is reported
// as an "extra" (either a forward-compatible gateway extension or drift).
const KNOWN_MODEL_FIELDS: Record<string, true> = {
  id: true,
  name: true,
  object: true,
  owned_by: true,
  created: true,
  context_window: true,
  context_length: true,
  max_output_tokens: true,
  capabilities: true,
  cost: true,
  headers: true,
  thinking_level_map: true,
  compat: true,
  // camelCase mirrors emitted by newer gateway versions
  contextWindow: true,
  maxTokens: true,
  reasoning: true,
  input: true,
  maxTokensField: true,
  mediaInput: true,
}

export function diagnoseEntries(
  entries: readonly GatewayModelEntry[],
  baseUrl: string,
): DiagnoseReport {
  if (entries.length === 0) {
    return {
      lines: [`x-gate diagnose — ${baseUrl}`, 'models: 0', '', '0/0 pass'],
      pass: 0,
      fail: 0,
      total: 0,
    }
  }

  const lines: string[] = []
  lines.push(`x-gate diagnose — ${baseUrl}`)
  lines.push(`models: ${entries.length}`)
  lines.push('')

  let pass = 0
  let fail = 0

  for (const m of entries) {
    const missing = REQUIRED_MODEL.filter((k) => m[k as keyof GatewayModelEntry] === undefined)
    const caps: GatewayCapabilities = m.capabilities ?? {}
    const capMissing = REQUIRED_CAPS.filter(
      (k) => caps[k as keyof GatewayCapabilities] === undefined,
    )
    const ok = missing.length === 0 && capMissing.length === 0

    if (ok) pass++
    else fail++

    const id = (m.id ?? '(no id)') as string
    lines.push(
      (ok ? '✓ ' : '✗ ') +
        id +
        (missing.length ? `  missing: ${missing.join(', ')}` : '') +
        (capMissing.length ? `  caps missing: ${capMissing.join(', ')}` : ''),
    )

    const extras = Object.keys(m).filter((k) => !KNOWN_MODEL_FIELDS[k])
    if (extras.length) lines.push(`    extra fields: ${extras.join(', ')}`)

    if (typeof m.max_output_tokens === 'number' && m.max_output_tokens === 0) {
      lines.push('    max_output_tokens=0 → unlimited (mapped to context_window)')
    }
  }

  lines.push('')
  lines.push(`${pass}/${entries.length} pass${fail > 0 ? `, ${fail} fail` : ''}`)

  return { lines, pass, fail, total: entries.length }
}
