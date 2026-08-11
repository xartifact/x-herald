/**
 * Proxy Test Environment — combines createTestEngine + createMockUpstream.
 *
 * Auto-creates a complete routing chain:
 *   Provider (baseUrl → mock upstream)
 *     → ModelGroup → ModelInstance → Membership
 *     → AccessModel → ModelRoute (route_to_group)
 *     → VirtualKey
 *
 * Usage:
 *   const env = await createProxyTestEnv({ protocol: 'openai' });
 *   env.upstream.setResponse(200, openaiChatCompletion({ content: 'Hi!' }));
 *   const res = await env.proxyChat({ model: 'gpt-4', messages: [...] });
 *   expect(res.status).toBe(200);
 *   await env.close();
 */

import { Hono } from 'hono'

import { createTestEngine, destroyTestEngine, getAuthToken } from './setup'
import { createMockUpstream, type MockUpstream } from './mock-upstream'
import { seedCanvasRoute } from './canvas-route-helper'

import { getDatabase } from '../db/client'
import {
  providers,
  modelGroups,
  modelInstances,
  modelGroupMemberships,
  accessModels,
  virtualKeys,
} from '../db'
import { invalidateVirtualKeyCache } from '../middleware/virtual-key'

// ─── Types ───────────────────────────────────────────────────────────────────

export type UpstreamProtocol = 'openai' | 'anthropic'

export interface ProxyTestEnvOptions {
  /** Upstream provider protocol — determines default endpoint path */
  protocol?: UpstreamProtocol
  /** Model name clients will request (access model name) */
  accessModelName?: string
  /** Actual model name at the upstream provider */
  actualModelName?: string
  /** Provider apiKey (sent as Bearer to upstream) */
  providerApiKey?: string
  /** Virtual key string clients use for auth (auto-generated if omitted) */
  virtualKey?: string
}

export interface ProxyTestEnv {
  /** Hono app for making requests */
  app: Hono
  /** Admin auth token (for management API) */
  token: string
  /** Mock upstream server */
  upstream: MockUpstream
  /** Virtual key string for proxy auth */
  virtualKey: string
  /** Access model name clients should use */
  accessModelName: string
  /** Provider ID */
  providerId: string
  /** Model group ID */
  modelGroupId: string
  /** Model instance ID */
  instanceId: string
  /** Access model ID */
  accessModelId: string

  // ── Proxy Request Helpers ─────────────────────────────────────────────────

  /** POST /api/v1/chat/completions (OpenAI) */
  proxyChat(
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Response | Promise<Response>
  /** POST /api/v1/messages (Anthropic) */
  proxyMessages(
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Response | Promise<Response>
  /** POST /api/v1/responses (OpenAI Responses) */
  proxyResponses(
    body: Record<string, unknown>,
    headers?: Record<string, string>,
  ): Response | Promise<Response>

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Close mock upstream + destroy test engine */
  close(): Promise<void>
}

// ─── Defaults ────────────────────────────────────────────────────────────────

const DEFAULT_CAPABILITIES = {
  streaming: true,
  functionCalling: true,
  vision: false,
  jsonMode: true,
  maxTokens: 8192,
  contextWindow: 128000,
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export async function createProxyTestEnv(options: ProxyTestEnvOptions = {}): Promise<ProxyTestEnv> {
  const protocol = options.protocol ?? 'openai'
  const accessModelName = options.accessModelName ?? 'gpt-4'
  const actualModelName =
    options.actualModelName ??
    (protocol === 'openai' ? 'gpt-4-turbo' : 'claude-3-5-sonnet-20241022')
  const vkString = options.virtualKey ?? 'xg_test_' + crypto.randomUUID().slice(0, 12)

  // 1. Start mock upstream
  const upstream = createMockUpstream()

  // 2. Create test engine (PGlite + Hono)
  const engine = await createTestEngine()
  const token = await getAuthToken(engine.app)
  const db = getDatabase()

  // 3. Create Provider pointing to mock upstream
  const [provider] = await db
    .insert(providers)
    .values({
      name: 'Test Upstream Provider',
      apiKey: options.providerApiKey ?? 'sk-test-upstream-key',
      protocols: {
        [protocol]: {
          baseUrl: upstream.url,
          enabled: true,
        },
      },
      enabled: true,
    })
    .returning()

  // 4. Create ModelGroup
  const [group] = await db
    .insert(modelGroups)
    .values({
      name: 'test-proxy-group',
      displayName: 'Test Proxy Group',
      capabilities: DEFAULT_CAPABILITIES,
      supportedProtocols: [protocol],
      enabled: true,
    })
    .returning()

  // 5. Create ModelInstance
  const [instance] = await db
    .insert(modelInstances)
    .values({
      providerId: provider.id,
      name: 'test-instance',
      actualModelName,
      weight: 100,
      priority: 0,
      enabled: true,
    })
    .returning()

  // 6. Link instance to group
  await db.insert(modelGroupMemberships).values({
    groupId: group.id,
    instanceId: instance.id,
  })

  // 7. Create AccessModel
  const [accessModel] = await db
    .insert(accessModels)
    .values({
      name: accessModelName,
      displayName: accessModelName,
      enabled: true,
      capabilities: DEFAULT_CAPABILITIES,
    })
    .returning()

  await seedCanvasRoute({
    amId: accessModel.id,
    amName: accessModelName,
    action: { type: 'route_to_group', targetId: group.id },
  })

  // 9. Create VirtualKey
  await db.insert(virtualKeys).values({
    key: vkString,
    name: 'test-proxy-key',
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

  // ── Build env object ──────────────────────────────────────────────────────

  const authHeaders = (extra?: Record<string, string>): Record<string, string> => ({
    Authorization: `Bearer ${vkString}`,
    'Content-Type': 'application/json',
    ...extra,
  })

  const env: ProxyTestEnv = {
    app: engine.app,
    token,
    upstream,
    virtualKey: vkString,
    accessModelName,
    providerId: provider.id,
    modelGroupId: group.id,
    instanceId: instance.id,
    accessModelId: accessModel.id,

    proxyChat: (body: Record<string, unknown>, headers?: Record<string, string>) =>
      engine.app.request('/api/v1/chat/completions', {
        method: 'POST',
        headers: authHeaders(headers),
        body: JSON.stringify(body),
      }),

    proxyMessages: (body: Record<string, unknown>, headers?: Record<string, string>) =>
      engine.app.request('/api/v1/messages', {
        method: 'POST',
        headers: authHeaders(headers),
        body: JSON.stringify(body),
      }),

    proxyResponses: (body: Record<string, unknown>, headers?: Record<string, string>) =>
      engine.app.request('/api/v1/responses', {
        method: 'POST',
        headers: authHeaders(headers),
        body: JSON.stringify(body),
      }),

    close: async () => {
      invalidateVirtualKeyCache(vkString)
      upstream.close()
      await destroyTestEngine()
    },
  }

  return env
}
