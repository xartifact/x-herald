---
name: writing-tests
description: Unit and integration testing conventions for x-herald. Use when writing tests for Bun+Hono backend services, React components, or failover/circuit-breaker/cache logic. Covers test runner setup, directory structure, mocking strategy, naming conventions, and factory helpers.
---

# x-herald Testing Conventions

## Test Runner Strategy

**Two runners, one project:**

| Runner     | Scope                                      | When                       |
| ---------- | ------------------------------------------ | -------------------------- |
| `bun:test` | Backend unit/integration tests, pure logic | Default. 95% of tests.     |
| `vitest`   | React component tests requiring DOM        | Only `*.ui.test.tsx` files |

### bun:test (default)

No config needed. Run with:

```bash
bun test                    # all tests
bun test src/features/gateway/failover/  # specific directory
bun test --watch            # watch mode
```

Always use explicit imports:

```typescript
import { describe, it, expect, beforeEach, afterEach, mock } from 'bun:test'
```

### vitest (React component tests only)

Config: `vitest.ui.ts` at project root. Only processes `*.ui.test.tsx` files.

```bash
bun run test:ui             # run React component tests
bun run test:ui:watch       # watch mode
```

## Directory Structure

### Rule: Co-locate by default, `__tests__/` only for integration suites

```
src/
├── features/gateway/
│   ├── failover/
│   │   ├── failover-executor.ts
│   │   └── failover-executor.test.ts        ← co-located unit test
│   ├── services/
│   │   ├── error-handler.ts
│   │   ├── error-handler.test.ts             ← co-located unit test
│   │   ├── virtual-key.ts
│   │   └── virtual-key.test.ts
│   └── transformer/
│       ├── cross-protocol.test.ts            ← integration test (can stay co-located)
│       └── protocols/
│           ├── anthropic.ts
│           └── anthropic.test.ts             ← co-located
├── app/admin/logs/components/
│   ├── latency-breakdown.tsx
│   └── latency-breakdown.ui.test.tsx         ← UI test (vitest)
└── test/                                     ← shared test infrastructure
    ├── setup.ts                              ← bun:test preload
    ├── ui-setup.ts                           ← vitest setup (RTL + jest-dom)
    ├── factories.ts                          ← mock data factories
    └── hono-helper.ts                        ← Hono test request helper
```

### Decision rule

| If test imports from...         | Place it...                             |
| ------------------------------- | --------------------------------------- |
| 1 source module                 | `foo.test.ts` next to `foo.ts`          |
| 2 source modules                | Still co-locate with the primary module |
| 3+ source modules (integration) | `__tests__/` in the parent directory    |
| React component needing DOM     | `foo.ui.test.tsx` next to `foo.tsx`     |
| Playwright E2E                  | `apps/web/tests/*.spec.ts` (unchanged)  |

## File Naming Convention

| Test type             | Filename                  | Runner     | Example                           |
| --------------------- | ------------------------- | ---------- | --------------------------------- |
| Unit                  | `foo.test.ts`             | bun:test   | `failover-executor.test.ts`       |
| Integration           | `bar.test.ts`             | bun:test   | `cross-protocol.test.ts`          |
| Adversarial/edge-case | `foo.adversarial.test.ts` | bun:test   | `layout-flow.adversarial.test.ts` |
| React component       | `foo.ui.test.tsx`         | vitest     | `latency-breakdown.ui.test.tsx`   |
| E2E                   | `feature.spec.ts`         | Playwright | `model-routes.spec.ts`            |

**Never use `.spec.ts` for unit/integration tests.** That suffix is reserved for Playwright E2E.

## Mock Strategy (Tiered)

### Tier 1: No mocking (preferred)

For pure functions and services with no external deps, just call them directly.

```typescript
// ✅ GOOD — pure function, no mock needed
import { joinUrl } from '../handlers/shared/join-url'

describe('joinUrl', () => {
  it('deduplicates /v1 path prefix', () => {
    expect(joinUrl('https://api.example.com/v1', '/v1/chat')).toBe(
      'https://api.example.com/v1/chat',
    )
  })
})
```

### Tier 2: Hono test client (for route handlers)

Use Hono's built-in `app.request()` — no Context mocking needed.

```typescript
import { Hono } from 'hono'
import { describe, it, expect } from 'bun:test'
import providerRoutes from '../routes/providers'

describe('GET /api/providers', () => {
  const app = new Hono()
  app.route('/api/providers', providerRoutes)

  it('returns 200 with provider list', async () => {
    const res = await app.request('/api/providers')
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(Array.isArray(data)).toBe(true)
  })
})
```

### Tier 3: `mock.module()` (for DB and external services)

```typescript
import { describe, it, expect, mock, beforeEach } from 'bun:test'

// mock.module MUST be called before importing the module under test
mock.module('@/core/db/client', () => ({
  db: { select: mock(() => ({ from: mock(() => ({ where: mock(() => []) })) })) },
}))

import { authenticateVirtualKey } from '../virtual-key'

describe('authenticateVirtualKey', () => {
  beforeEach(() => {
    mock.restore() // reset all mocks between tests
  })

  it('returns null for unknown key', async () => {
    const result = await authenticateVirtualKey('nonexistent')
    expect(result).toBeNull()
  })
})
```

### Tier 4: `vi.mock()` (React component tests only)

```typescript
// In *.ui.test.tsx files only
import { vi } from 'vitest'

vi.mock('lucide-react', () => ({
  ChevronRight: () => <span data-testid="icon-chevron" />,
  X: () => <span data-testid="icon-close" />,
}))
```

### Tier 5: MSW (only for data-fetching components)

Only when a component uses `fetch()` / React Query / SWR. **Not needed for current codebase.**

## Test Factories

Use factory functions (not fixture files) for test data:

```typescript
// src/test/factories.ts
import type { Log } from '@/hooks/use-logs'

export function createMockLog(overrides: Partial<Log> = {}): Log {
  return {
    id: 'log-001',
    status: 'success',
    statusCode: 200,
    modelName: 'gpt-4o',
    providerName: 'openai',
    latencyMs: 1500,
    totalTokens: 500,
    inputTokens: 300,
    outputTokens: 200,
    requestMethod: 'POST',
    requestPath: '/v1/chat/completions',
    streaming: true,
    retryCount: 0,
    createdAt: new Date('2025-01-15T10:30:00Z').toISOString(),
    ...overrides,
  } as Log
}

export function createMockProvider(overrides = {}) {
  return {
    id: 'provider-1',
    name: 'OpenAI',
    type: 'openai',
    baseUrl: 'https://api.openai.com',
    enabled: true,
    ...overrides,
  }
}

export function createMockVirtualKey(overrides = {}) {
  return {
    id: 'vk-1',
    name: 'test-key',
    key: 'sk-test-xxx',
    enabled: true,
    ...overrides,
  }
}
```

## Hono Test Helper

```typescript
// src/test/hono-helper.ts
import { Hono } from 'hono'

/**
 * Create a test request against a Hono app
 */
export function testRequest(
  app: Hono,
  method: string,
  path: string,
  options?: {
    headers?: Record<string, string>
    body?: unknown
  },
) {
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  }
  if (options?.body) {
    init.body = JSON.stringify(options.body)
  }
  return app.request(path, init)
}
```

## React Component Test Template

```typescript
// latency-breakdown.ui.test.tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LatencyBreakdown } from './latency-breakdown'

describe('LatencyBreakdown', () => {
  const defaultProps = {
    totalMs: 3000,
    gatewayOverheadMs: 100,
    providerTtfbMs: 500,
    streamDurationMs: 2400,
    formatDuration: (ms: number) => `${ms}ms`,
  }

  it('renders segment labels', () => {
    render(<LatencyBreakdown {...defaultProps} />)
    expect(screen.getByText(/网关预处理/)).toBeInTheDocument()
    expect(screen.getByText(/Provider TTFB/)).toBeInTheDocument()
  })

  it('returns null when no segments', () => {
    const { container } = render(
      <LatencyBreakdown totalMs={0} formatDuration={defaultProps.formatDuration} />
    )
    expect(container.innerHTML).toBe('')
  })
})
```

## Coverage Thresholds (Ramp-up)

| Phase        | Line | Branch | Scope                                         |
| ------------ | ---- | ------ | --------------------------------------------- |
| Current      | 0%   | 0%     | No threshold — establish infrastructure first |
| Next sprint  | 10%  | 15%    | New/modified files only                       |
| +1 sprint    | 30%  | 25%    | Global                                        |
| Steady state | 50%  | 40%    | Global; 80% on new files                      |

## Priority Test List

Test these in order (highest business impact first):

1. `failover-executor.ts` — pure function, clear I/O, zero tests currently
2. `circuit-breaker.ts` — state machine, exhaustive state coverage
3. `virtual-key.ts` cache — TTL logic, invalidation paths
4. `error-handler.ts` — existing partial coverage, extend for new paths
5. `log-service.ts` — `createStreamLog` merge behavior

## Anti-patterns

| ❌ Don't                                              | ✅ Do                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Test implementation details (state, internal methods) | Test behavior (inputs → outputs)                                                 |
| Use `__tests__/` for unit tests                       | Co-locate `foo.test.ts` next to `foo.ts`                                         |
| Use snapshot tests for UI                             | Assert visible text and ARIA roles                                               |
| Mock everything                                       | Prefer real code + Hono test client                                              |
| Use `describe('module', () => { it('works', ...) })`  | Use descriptive test names: `it('should retry next provider on 429 error', ...)` |
| Put test data in separate `fixtures/` JSON files      | Use factory functions with spread overrides                                      |
| Use `.spec.ts` for unit tests                         | Reserve `.spec.ts` for Playwright E2E only                                       |

## Pre-existing Test Failures

9 Anthropic transformer tests currently fail. Before enabling CI gating:

1. Triage each failure
2. Either fix the test or `test.skip` with a comment linking to a tracking issue
3. Ensure `bun test` exits 0 before requiring it in CI
