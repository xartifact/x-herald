---
name: engineering-conventions
description: Engineering invariants and coding conventions for x-llm-gateway. Covers import ordering, naming, error handling, shared constants, file organization, and architectural rules that must be followed in all new code.
---

# x-llm-gateway Engineering Conventions

## File Organization

### Component splitting threshold

- **Monolithic component**: When a single file exceeds **300 lines**, consider splitting
- **Split criterion**: Extract by logical section, not by line count alone
- **Naming**: Extracted files use kebab-case matching the section name
  - `metadata-basic-sections.tsx` (not `MetadataBasicSections.tsx`)
  - `latency-breakdown.tsx` (not `LatencyBreakdown.tsx`)
- **Exports**: Each extracted file exports one main component (named export, not default)

### Import ordering

Enforce this order with blank lines between groups:

```typescript
// 1. 'use client' directive (if needed)
'use client'

// 2. React imports
import { useState, useEffect } from 'react'

// 3. External libraries
import { ChevronRight, X } from 'lucide-react'
import { Hono } from 'hono'

// 4. Internal packages (@/ aliases)
import { cn } from '@/core/lib/utils'
import { authenticateVirtualKey } from '@/features/gateway/services/virtual-key'

// 5. Relative imports (./  ../)
import { InfoRow, Section } from './log-info-row'
import { extractContentFeatures } from './utils/extract-content-features'

// 6. Type-only imports
import type { Log } from '@/hooks/use-logs'
import type { ContentFeatures } from './utils/extract-content-features'
```

**ESLint rule**: `import/order` enforces this. Run `bun run lint:fix` to auto-fix.

### No unused imports

After extracting components, always clean up unused imports. Common forgotten ones:
- `cn` from `@/core/lib/utils`
- `CLIENT_REGISTRY` from `@/features/gateway/services/client-identifier`
- `Badge`, `Button`, `Separator` from UI components

## Shared Constants

### Timeout constants

All timeout values MUST be defined in shared files, never hardcoded:

```typescript
// ✅ CORRECT — shared/constants.ts
export const PROVIDER_TIMEOUT_MS = 30_000
export const STREAM_TIMEOUT_MS = 120_000
export const CIRCUIT_BREAKER_RESET_MS = 60_000

// ❌ WRONG — hardcoded in handler
const timeout = 30000  // Don't do this
```

### CATCHALL_VM_NAME

```typescript
// ✅ CORRECT — virtual-models/constants.ts
export const CATCHALL_VM_NAME = '(catch-all)'

// ❌ WRONG — string literal
if (model.name === '(catch-all)')  // Don't do this
```

## Function Interfaces

### Parameter objects for 3+ params

```typescript
// ✅ CORRECT — options object pattern
interface FailoverExecutorParams {
  providers: Provider[]
  maxRetries: number
  onRetry?: (provider: Provider, error: Error) => void
}

export async function executeWithFailover(
  c: Context,
  params: FailoverExecutorParams
): Promise<Response> { ... }

// ❌ WRONG — positional params
export async function executeWithFailover(
  c: Context,
  providers: Provider[],
  maxRetries: number,
  onRetry?: (provider: Provider, error: Error) => void
): Promise<Response> { ... }
```

### Function merging

When two functions have overlapping responsibility, merge them:

```typescript
// ✅ CORRECT — merged with discriminator param
export async function createStreamLog(
  db: Database,
  log: Omit<Log, 'id'>,
  isStream: boolean
): Promise<string> { ... }

// ❌ WRONG — two separate functions
export async function logStreamStart(db: Database, log: Log) { ... }
export async function logRequestStart(db: Database, log: Log) { ... }
```

## Error Handling

### Provider error handling

```typescript
// ✅ CORRECT — structured error handler with typed params
interface ProviderErrorHandlerParams {
  error: unknown
  provider: Provider
  context: Context
  retryCount: number
}

export function handleProviderError(params: ProviderErrorHandlerParams): ErrorResponse { ... }

// ❌ WRONG — positional params with loose typing
export function handleProviderError(error: any, provider: any, ctx: any): any { ... }
```

### Error types

- Use `AppError` class for application errors
- Always include `statusCode` in error responses
- Never expose internal error details to clients

## Cache Patterns

### globalThis cache pattern

```typescript
// ✅ CORRECT — globalThis cache with TTL
const CACHE_KEY = 'virtual-key-cache'
const CACHE_TTL_MS = 30_000  // 30 seconds

interface CacheEntry<T> {
  data: T
  expiresAt: number
}

function getCache<T>(key: string): T | null {
  const cache = (globalThis as Record<string, unknown>)[CACHE_KEY] as Map<string, CacheEntry<T>> | undefined
  if (!cache) return null
  const entry = cache.get(key)
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key)
    return null
  }
  return entry.data
}

// ❌ WRONG — module-level variable (lost on HMR/reload)
let cachedValue: T | null = null
```

### Cache invalidation

When data changes via API, invalidate the cache:

```typescript
// In PUT/DELETE/reset handlers:
async function invalidateCache(keyId: string) {
  const cache = (globalThis as Record<string, unknown>)[CACHE_KEY] as Map<string, CacheEntry<unknown>> | undefined
  cache?.delete(keyId)
}
```

## Circuit Breaker

### State recovery on startup

```typescript
// ✅ CORRECT — restore from DB events on startup
export async function recoverCircuitBreakerState(db: Database): Promise<void> {
  try {
    const openedEvents = await db
      .selectFrom('circuit_breaker_events')
      .where('state', '=', 'opened')
      .orderBy('triggered_at', 'desc')
      .execute()

    for (const event of openedEvents) {
      circuitBreakerRegistry.restoreOpenState(event.provider_id, event)
    }
  } catch (error) {
    // DB failure is non-fatal — circuit breaker starts in default state
    logger.error('Failed to recover circuit breaker state', { error })
  }
}
```

## React Component Conventions

### Component extraction

When splitting a monolithic component:

1. Each extracted file exports **one** main component
2. Props interfaces are defined in the same file as the component
3. Shared types (like `Log`, `ContentFeatures`) are imported from their source, never re-exported
4. Keep `'use client'` directive in every component file that uses hooks or browser APIs

### Unused prop cleanup

After extraction, remove props that are no longer needed:

```typescript
// ✅ CORRECT — only props actually used
interface MetadataPerformanceSectionsProps {
  log: Log
  contentFeatures: ContentFeatures | null
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}

// ❌ WRONG — leftover unused props from parent
interface MetadataPerformanceSectionsProps {
  log: Log
  isPending: boolean      // unused after extraction
  isSuccess: boolean      // unused after extraction
  contentFeatures: ContentFeatures | null
  formatDuration: (ms: number) => string
  formatTokens: (tokens: number) => string
}
```

### Import ordering in extracted components

After extraction, remove imports that are no longer needed:

```typescript
// ❌ WRONG — leftover from parent
import { CLIENT_REGISTRY } from '@/features/gateway/services/client-identifier'
import { BodySubTabs } from './body-sub-tabs'
import { cn } from '@/core/lib/utils'  // not used in this component

// ✅ CORRECT — only what's needed
import { Badge } from '@/components/ui/badge'
import { InfoRow, Section } from './log-info-row'
```

## Testing Conventions

See `writing-tests` skill for detailed test conventions. Key rules:

1. **Co-locate tests**: `foo.ts` → `foo.test.ts` in the same directory
2. **Use `bun:test` for backend**, `vitest` for React components only
3. **Explicit imports**: `import { describe, it, expect } from 'bun:test'`
4. **Factory functions over fixture files**: `createMockLog(overrides)` not `fixtures/log.json`
5. **No snapshot tests for UI**: Assert behavior, not markup structure
