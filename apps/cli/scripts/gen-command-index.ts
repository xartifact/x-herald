/**
 * Regenerate `skills/commands.json` from the spec table.
 *
 * The skills directory ships machine-readable command metadata so agents can
 * discover exact flags without parsing --help. Run this after editing
 * `src/spec-commands.ts`; `skills/commands.test.ts` fails when they drift.
 *
 *   bun run scripts/gen-command-index.ts
 */
import { MOUNTS } from '../src/executor'
import { SPEC_COMMANDS } from '../src/spec-commands'

const commands = SPEC_COMMANDS.map((spec) => ({
  command: ['x-herald', spec.group, spec.name, ...(spec.args ?? []).map((a) => `<${a}>`)].join(' '),
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

await Bun.write(
  new URL('../skills/commands.json', import.meta.url),
  JSON.stringify({ version: 1, generatedFrom: 'src/spec-commands.ts', commands }, null, 2) + '\n',
)
console.log(`wrote ${commands.length} commands to skills/commands.json`)
