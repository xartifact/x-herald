import { applyJsonDiff, type JsonDiff, type JsonValue } from '@xartifact/x-herald-shared'

/** Reconstructs an object payload, returning null for absent or invalid inputs. */
export function reconstructJsonBody(
  source: Record<string, unknown> | null | undefined,
  diff: JsonDiff | null | undefined,
): Record<string, unknown> | null {
  if (!source || !diff) return null

  try {
    const result = applyJsonDiff(source as unknown as JsonValue, diff)
    return result !== null && typeof result === 'object' && !Array.isArray(result)
      ? (result as Record<string, unknown>)
      : null
  } catch {
    return null
  }
}
