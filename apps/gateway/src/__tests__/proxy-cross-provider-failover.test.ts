/**
 * Cross-provider failover end-to-end test.
 *
 * Verifies that when the primary upstream provider fails, the gateway
 * automatically fails over to the next instance in the model group,
 * returning a successful response to the client.
 *
 * Scenario:
 *   - 1 access model "gpt-4-prod"
 *   - 1 model group "gpt-4-failover-group" with 2 instances from 2 different
 *     providers, same OpenAI protocol (realistic: multi-key or OpenAI + Groq)
 *   - Primary (priority=1) → Provider A
 *   - Fallback (priority=2) → Provider B
 *
 * What this validates:
 *   1. With both providers healthy: requests go to the primary (priority order)
 *   2. When primary returns 5xx: gateway fails over to backup and returns 200
 *   3. When primary times out: same failover path
 *   4. When both fail: gateway returns an error to the client
 *   5. The actual upstream request hits BOTH mocks in the failover case
 *      (not just one) — proving the failover actually happened
 *
 * Implementation note: each scenario lives in its own describe block with
 * its own beforeAll/afterAll. The circuit-breaker registry is in-memory,
 * so reusing one engine across many tests would leak "open circuit" state
 * from earlier failure scenarios into later healthy-provider scenarios.
 */

import { describe, it, expect, beforeAll, afterAll } from 'bun:test'

import { createMockUpstream, openaiChatCompletion } from '../test/mock-upstream'
import { createTestEngine, getAuthToken, destroyTestEngine } from '../test/setup'
import { getDatabase } from '../db/client'
import {
  providers,
  modelGroups,
  modelInstances,
  modelGroupMemberships,
  accessModels,
  virtualKeys,
} from '../db'
import { seedCanvasRoute } from '../test/canvas-route-helper'
import { invalidateVirtualKeyCache } from '../middleware/virtual-key'
import type { Hono } from 'hono'
import type { MockUpstream } from '../test/mock-upstream'

const PRIMARY_CONTENT = 'reply from primary (provider A)'
const BACKUP_CONTENT = 'recovered from backup (provider B)'

// ─────────────────────────────────────────────────────────────────────────────
// Shared setup helper — builds a 2-provider / 2-instance chain with a fresh engine.
// Used by every scenario so they are mutually isolated.
// ─────────────────────────────────────────────────────────────────────────────

interface ScenarioEnv {
  app: Hono
  mockA: MockUpstream
  mockB: MockUpstream
  virtualKey: string
  accessModelName: string
  primaryModelActualName: string
  backupModelActualName: string
  close(): Promise<void>
}

async function buildScenarioEnv(): Promise<ScenarioEnv> {
  const mockA = createMockUpstream()
  const mockB = createMockUpstream()
  const accessModelName = 'gpt-4-prod-' + crypto.randomUUID().slice(0, 8)
  const primaryModelActualName = 'gpt-4-turbo'
  const backupModelActualName = 'gpt-4-turbo-backup'

  const engine = await createTestEngine()
  const app = engine.app
  const db = getDatabase()

  void getAuthToken(app)

  const [providerA] = await db
    .insert(providers)
    .values({
      name: 'Provider A (primary)',
      apiKey: 'sk-test-a',
      protocols: { openai: { baseUrl: mockA.url, enabled: true } },
      enabled: true,
    })
    .returning()

  const [providerB] = await db
    .insert(providers)
    .values({
      name: 'Provider B (backup)',
      apiKey: 'sk-test-b',
      protocols: { openai: { baseUrl: mockB.url, enabled: true } },
      enabled: true,
    })
    .returning()

  const [group] = await db
    .insert(modelGroups)
    .values({
      name: 'gpt-4-failover-group-' + crypto.randomUUID().slice(0, 8),
      displayName: 'GPT-4 Failover Group',
      capabilities: {
        streaming: true,
        functionCalling: true,
        vision: false,
        jsonMode: true,
        maxTokens: 8192,
        contextWindow: 128000,
      },
      supportedProtocols: ['openai'],
      enabled: true,
    })
    .returning()

  const [instanceA] = await db
    .insert(modelInstances)
    .values({
      providerId: providerA.id,
      name: 'openai-primary',
      actualModelName: primaryModelActualName,
      weight: 100,
      enabled: true,
    })
    .returning()

  const [instanceB] = await db
    .insert(modelInstances)
    .values({
      providerId: providerB.id,
      name: 'openai-backup',
      actualModelName: backupModelActualName,
      weight: 100,
      enabled: true,
    })
    .returning()

  await db.insert(modelGroupMemberships).values([
    { groupId: group.id, instanceId: instanceA.id, priority: 0 },
    { groupId: group.id, instanceId: instanceB.id, priority: 1 },
  ])

  const [accessModel] = await db
    .insert(accessModels)
    .values({
      name: accessModelName,
      displayName: 'GPT-4 Prod',
      enabled: true,
      capabilities: null,
    })
    .returning()

  await seedCanvasRoute({
    amId: accessModel.id,
    amName: accessModelName,
    action: { type: 'route_to_group', targetId: group.id },
  })

  const virtualKey = 'xg_test_' + crypto.randomUUID().slice(0, 12)
  await db.insert(virtualKeys).values({
    key: virtualKey,
    name: 'cross-provider-failover-test',
    enabled: true,
    allowedModels: null,
    rateLimitRpm: null,
    rateLimitRpd: null,
    tokenLimitDaily: null,
    expiresAt: null,
    lastUsedAt: null,
    totalRequests: 0,
    totalTokens: 0n,
  })

  return {
    app,
    mockA,
    mockB,
    virtualKey,
    accessModelName,
    primaryModelActualName,
    backupModelActualName,
    async close() {
      invalidateVirtualKeyCache(virtualKey)
      mockA.close()
      mockB.close()
      await destroyTestEngine()
    },
  }
}

function chatRequest(env: ScenarioEnv) {
  return env.app.request('/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.virtualKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: env.accessModelName,
      messages: [{ role: 'user', content: 'hi' }],
    }),
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Scenarios
// ─────────────────────────────────────────────────────────────────────────────

describe('cross-provider failover / both healthy', () => {
  let env: ScenarioEnv

  beforeAll(async () => {
    env = await buildScenarioEnv()
  })

  afterAll(async () => {
    await env.close()
  })

  it('routes to primary only (priority order)', async () => {
    env.mockA.setResponse(200, openaiChatCompletion({ content: PRIMARY_CONTENT }))
    env.mockB.setResponse(200, openaiChatCompletion({ content: BACKUP_CONTENT }))

    const res = await chatRequest(env)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      choices: Array<{ message: { content: string } }>
    }
    expect(body.choices[0].message.content).toBe(PRIMARY_CONTENT)

    expect(env.mockA.receivedRequests.length).toBe(1)
    expect(env.mockB.receivedRequests.length).toBe(0)

    const aReq = env.mockA.lastRequest()
    expect((aReq.body as { model: string }).model).toBe(env.primaryModelActualName)
  })
})

describe('cross-provider failover / primary 5xx', () => {
  let env: ScenarioEnv

  beforeAll(async () => {
    env = await buildScenarioEnv()
  })

  afterAll(async () => {
    await env.close()
  })

  it('primary 500 → automatic failover to backup, client gets 200', async () => {
    env.mockA.setOpenAIError(500, 'Internal server error')
    env.mockB.setResponse(200, openaiChatCompletion({ content: BACKUP_CONTENT }))

    const res = await chatRequest(env)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      choices: Array<{ message: { content: string } }>
    }
    expect(body.choices[0].message.content).toBe(BACKUP_CONTENT)

    expect(env.mockA.receivedRequests.length).toBeGreaterThanOrEqual(1)
    expect(env.mockB.receivedRequests.length).toBeGreaterThanOrEqual(1)
    const bReq = env.mockB.lastRequest()
    expect((bReq.body as { model: string }).model).toBe(env.backupModelActualName)
  })

  it('primary 429 → automatic failover to backup', async () => {
    env.mockA.setOpenAIError(429, 'Rate limit exceeded')
    env.mockB.setResponse(200, openaiChatCompletion({ content: BACKUP_CONTENT }))

    const res = await chatRequest(env)
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      choices: Array<{ message: { content: string } }>
    }
    expect(body.choices[0].message.content).toBe(BACKUP_CONTENT)

    expect(env.mockA.receivedRequests.length).toBeGreaterThanOrEqual(1)
    expect(env.mockB.receivedRequests.length).toBeGreaterThanOrEqual(1)
  })
})

describe('cross-provider failover / primary timeout', () => {
  let env: ScenarioEnv

  beforeAll(async () => {
    env = await buildScenarioEnv()
  })

  afterAll(async () => {
    await env.close()
  })

  it(
    'primary TTFB timeout → automatic failover to backup',
    async () => {
      // 90s delay far exceeds the gateway TTFB budget → treated as a timeout failure
      env.mockA.setDelayedResponse(90_000, 200, openaiChatCompletion({ content: 'too late' }))
      env.mockB.setResponse(200, openaiChatCompletion({ content: BACKUP_CONTENT }))

      const res = await chatRequest(env)
      expect(res.status).toBe(200)

      const body = (await res.json()) as {
        choices: Array<{ message: { content: string } }>
      }
      expect(body.choices[0].message.content).toBe(BACKUP_CONTENT)

      expect(env.mockA.receivedRequests.length).toBeGreaterThanOrEqual(1)
      expect(env.mockB.receivedRequests.length).toBeGreaterThanOrEqual(1)
    },
    { timeout: 120_000 },
  )
})

describe('cross-provider failover / both down', () => {
  let env: ScenarioEnv

  beforeAll(async () => {
    env = await buildScenarioEnv()
  })

  afterAll(async () => {
    await env.close()
  })

  it('both providers fail → client receives 5xx error', async () => {
    env.mockA.setOpenAIError(500, 'Primary down')
    env.mockB.setOpenAIError(500, 'Backup also down')

    const res = await chatRequest(env)
    expect(res.status).toBeGreaterThanOrEqual(500)

    const body = (await res.json()) as { error?: unknown }
    expect(body).toHaveProperty('error')
  })
})
