import { describe, expect, it } from 'bun:test'

import {
  buildRoleConfigSnippet,
  DEFAULT_THINKING_SUFFIX,
  PROVIDER_PREFIX,
  resolveRoleModels,
} from './model-roles.ts'
import type { GatewayModelEntry } from './types.ts'

const base = (id: string): GatewayModelEntry => ({
  id,
  context_window: 1048576,
  max_output_tokens: 131072,
})

describe('resolveRoleModels', () => {
  it('maps every role to its first available candidate in catalogue order', () => {
    const entries = [
      base('Explorer'),
      base('Architect'),
      base('Designer'),
      base('Plan'),
      base('DomainExpert'),
    ]
    const resolved = resolveRoleModels(entries)
    // smol/tiny/commit → Explorer; slow → Architect; vision/designer → Designer
    expect([...resolved.entries()]).toEqual([
      ['smol', 'Explorer'],
      ['slow', 'Architect'],
      ['vision', 'Designer'],
      ['plan', 'Plan'],
      ['designer', 'Designer'],
      ['commit', 'Explorer'],
      ['tiny', 'Explorer'],
      ['task', 'Plan'],
      ['advisor', 'DomainExpert'],
      ['default', 'Plan'],
    ])
  })

  it('drops roles whose candidate model is absent from the catalogue', () => {
    // Only Explorer/Plan present → slow/vision/designer/advisor unresolvable.
    const entries = [base('Explorer'), base('Plan')]
    const resolved = resolveRoleModels(entries)
    expect(resolved.has('smol')).toBe(true)
    expect(resolved.has('default')).toBe(true)
    expect(resolved.has('slow')).toBe(false)
    expect(resolved.has('advisor')).toBe(false)
  })
})

describe('buildRoleConfigSnippet', () => {
  it('renders canonical order with :xhigh suffix', () => {
    const entries = [
      base('Explorer'),
      base('Architect'),
      base('Designer'),
      base('Plan'),
      base('DomainExpert'),
    ]
    const snippet = buildRoleConfigSnippet(entries)
    expect(snippet.lines).toEqual([
      '  default: x-herald/Plan:xhigh',
      '  smol: x-herald/Explorer:xhigh',
      '  slow: x-herald/Architect:xhigh',
      '  vision: x-herald/Designer:xhigh',
      '  plan: x-herald/Plan:xhigh',
      '  designer: x-herald/Designer:xhigh',
      '  commit: x-herald/Explorer:xhigh',
      '  tiny: x-herald/Explorer:xhigh',
      '  task: x-herald/Plan:xhigh',
      '  advisor: x-herald/DomainExpert:xhigh',
    ])
    expect(snippet.unresolved).toEqual([])
  })

  it('reports unresolved roles when candidates are missing', () => {
    const entries = [base('Explorer'), base('Plan')]
    const snippet = buildRoleConfigSnippet(entries)
    expect(snippet.lines).toContain('  smol: x-herald/Explorer:xhigh')
    // slow/vision/designer/advisor have no candidate → reported, not rendered
    expect(snippet.lines.some((l) => l.startsWith('  slow:'))).toBe(false)
    expect(snippet.unresolved).toEqual(['slow', 'vision', 'designer', 'advisor'])
  })

  it('pins every role with the xhigh suffix constant', () => {
    expect(DEFAULT_THINKING_SUFFIX).toBe('xhigh')
    expect(PROVIDER_PREFIX).toBe('x-herald')
  })

  it('renders nothing when catalogue is empty', () => {
    const snippet = buildRoleConfigSnippet([])
    expect(snippet.lines).toEqual([])
    expect(snippet.unresolved).toHaveLength(10)
  })
})
