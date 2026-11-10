/**
 * Operator skill embedded into the binary at build time.
 *
 * Every file is a static import, which is the only form `bun build --compile`
 * embeds. That makes the distributed binary self-contained: a machine with no
 * checkout, no `bun install`, and no network can still hand an agent the exact
 * command reference for this build (`x-herald skill install`).
 *
 * `skills/commands.json` is generated from `src/spec-commands.ts`
 * (`bun run gen:commands`) and guarded by `src/command-index.test.ts`, so the
 * embedded copy cannot drift from the command table.
 */

import skill from '../skills/SKILL.md' with { type: 'text' }
import changeAndRollback from '../skills/change-and-rollback.md' with { type: 'text' }
import commandIndex from '../skills/commands.json'
import costAudit from '../skills/cost-audit.md' with { type: 'text' }
import troubleshooting from '../skills/troubleshooting.md' with { type: 'text' }

/** Directory name installed under each agent runtime's `skills/` root. */
export const SKILL_NAME = 'x-herald-cli'

/** Markdown files shipped with the skill, keyed by path inside the skill directory. */
export const SKILL_DOCS: Readonly<Record<string, string>> = {
  'SKILL.md': skill,
  'change-and-rollback.md': changeAndRollback,
  'cost-audit.md': costAudit,
  'troubleshooting.md': troubleshooting,
}

/**
 * Machine-readable command index, serialized back to the same shape the
 * generator writes so an installed copy is byte-stable across runs.
 */
export const COMMAND_INDEX_JSON = JSON.stringify(commandIndex, null, 2) + '\n'
