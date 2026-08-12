/**
 * Top-level entrypoint for both pi-coding-agent (auto-discovers ./index.ts
 * via package.json `pi.manifest`) and oh-my-pi (auto-discovers ./index.ts
 * as a convention-based extension).
 *
 * The actual factory lives in src/entry.ts; this file is a one-line
 * re-export so both runtimes find their expected entry.
 */

export { default } from './src/entry.ts'
