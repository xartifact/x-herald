import { describe, expect, it } from 'bun:test'

import index from '../skills/commands.json'
import { MOUNTS } from './executor'
import { SPEC_COMMANDS } from './spec-commands'

describe('skills/commands.json', () => {
  it('stays in sync with the spec table', () => {
    const expected = SPEC_COMMANDS.map((spec) => ({
      command: ['x-herald', spec.group, spec.name, ...(spec.args ?? []).map((a) => `<${a}>`)].join(
        ' ',
      ),
      method: spec.method,
      path: (MOUNTS[spec.group] + spec.path).replace(/\/+$/, ''),
      description: spec.description,
      args: spec.args ?? [],
      options: (spec.options ?? []).map((option) => ({
        flag: `--${option.name}`,
        in: option.in,
        takesValue: option.takesValue ?? false,
        desc: option.desc ?? null,
      })),
    }))
    expect(index.commands).toEqual(expected)
  })

  it('advertises no trailing-slash paths, matching what the CLI actually sends', () => {
    for (const command of index.commands) {
      expect(command.path.endsWith('/')).toBe(false)
      expect(command.path.startsWith('/api/')).toBe(true)
    }
  })
})
