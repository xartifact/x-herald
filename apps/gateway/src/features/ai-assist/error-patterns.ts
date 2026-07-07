const MIN_COUNT_FOR_AUTO_APPLY = 2

interface PatternEntry {
  count: number
  lastSeen: Date
  fix: unknown
}

interface ErrorPatternKey {
  errorType: string
  provider: string
  model: string
}

interface ErrorPatternRecord extends ErrorPatternKey {
  count: number
  fix: unknown
}

const cache = new Map<string, PatternEntry>()

/** Clear the error pattern cache (for testing). */
export function clearErrorPatternCache(): void {
  cache.clear()
}

function buildKey(params: ErrorPatternKey): string {
  return `${params.errorType}:${params.provider}:${params.model}`
}

export class ErrorPatternLearner {
  async recordResolution(params: ErrorPatternKey & { fix: unknown }): Promise<void> {
    const key = buildKey(params)
    const existing = cache.get(key)
    cache.set(key, {
      count: (existing?.count ?? 0) + 1,
      lastSeen: new Date(),
      fix: params.fix,
    })
  }

  async findKnownFix(params: ErrorPatternKey): Promise<unknown | null> {
    const key = buildKey(params)
    const pattern = cache.get(key)

    if (pattern && pattern.count >= MIN_COUNT_FOR_AUTO_APPLY) {
      return pattern.fix
    }

    return null
  }

  async getCommonPatterns(limit = 10): Promise<ErrorPatternRecord[]> {
    return Array.from(cache.entries())
      .map(([key, value]) => {
        const [errorType, provider, model] = key.split(':')
        return {
          errorType: errorType ?? '',
          provider: provider ?? '',
          model: model ?? '',
          count: value.count,
          fix: value.fix,
        }
      })
      .toSorted((a, b) => b.count - a.count)
      .slice(0, limit)
  }
}
