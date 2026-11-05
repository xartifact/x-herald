/** Output format for machine-readable vs human-readable consumption. */
export type OutputFormat = 'json' | 'table' | 'raw'

export interface OutputOptions {
  format: OutputFormat
}

/**
 * Render a response for a terminal or an agent.
 *
 * `json`/`raw` are the stable machine contract: stdout carries only the payload so
 * it can be piped into jq. `table` is a convenience view and is explicitly not
 * stable — agents should pass `--format json`.
 */
export function printResult(data: unknown, options: OutputOptions): void {
  if (options.format === 'raw') {
    process.stdout.write(typeof data === 'string' ? data + '\n' : JSON.stringify(data) + '\n')
    return
  }
  if (options.format === 'json' || !Array.isArray(data)) {
    process.stdout.write(JSON.stringify(data, null, 2) + '\n')
    return
  }
  const rows = data.map((row) =>
    row && typeof row === 'object'
      ? flattenForTable(row as Record<string, unknown>)
      : { value: row },
  )
  if (rows.length === 0) {
    process.stdout.write('(empty)\n')
    return
  }
  console.table(rows)
}

/** Flatten nested objects/arrays to compact cells so table columns stay readable. */
function flattenForTable(row: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) flat[key] = ''
    else if (typeof value === 'object') flat[key] = JSON.stringify(value)
    else flat[key] = value
  }
  return flat
}

/** Print a message to stderr so it never contaminates piped JSON on stdout. */
export function report(message: string): void {
  process.stderr.write(message + '\n')
}
