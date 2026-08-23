import { describe, it, expect } from 'bun:test'
import { Hono } from 'hono'
import { identifyClient, resolveClientIp, CLIENT_REGISTRY } from './client-identifier'

describe('identifyClient', () => {
  // Claude Code
  it('identifies claude-code from claude.code UA', () => {
    const info = identifyClient('claude.code/1.2.0 (Linux; U; EN)')
    expect(info.type).toBe('claude-code')
    expect(info.name).toBe('Claude Code')
    expect(info.version).toBe('1.2.0')
  })

  it('identifies claude-code from claude-cli UA', () => {
    const info = identifyClient('claude-cli/0.1.0 (MacOS)')
    expect(info.type).toBe('claude-code')
    expect(info.name).toBe('Claude Code')
  })

  // Cherry Studio
  it('identifies cherry-studio', () => {
    const info = identifyClient('CherryStudio/1.5.0')
    expect(info.type).toBe('cherry-studio')
    expect(info.name).toBe('CherryStudio')
  })

  // OpenCode
  it('identifies opencode', () => {
    const info = identifyClient('OpenCode/1.0.0')
    expect(info.type).toBe('opencode')
    expect(info.name).toBe('OpenCode')
  })

  // OpenClaw
  it('identifies openclaw', () => {
    const info = identifyClient('OpenClaw/0.3.0')
    expect(info.type).toBe('openclaw')
    expect(info.name).toBe('OpenClaw')
  })

  // Cursor
  it('identifies cursor', () => {
    const info = identifyClient('Cursor/0.40.0 (MacOS)')
    expect(info.type).toBe('cursor')
    expect(info.name).toBe('Cursor')
  })

  // Cline
  it('identifies cline', () => {
    const info = identifyClient('Cline/dev')
    expect(info.type).toBe('cline')
    expect(info.name).toBe('Cline')
  })

  it('does not match substrings like "decline" for cline', () => {
    const info = identifyClient('Decline/1.0')
    expect(info.type).toBe('unknown')
  })

  // Aider
  it('identifies aider', () => {
    const info = identifyClient('Aider/0.50.0')
    expect(info.type).toBe('aider')
    expect(info.name).toBe('Aider')
  })

  it('does not match "maider" for aider', () => {
    const info = identifyClient('Maider/1.0')
    expect(info.type).toBe('unknown')
  })

  // Continue.dev
  it('identifies continue.dev', () => {
    const info = identifyClient('Continue.dev/1.0.0')
    expect(info.type).toBe('continue')
    expect(info.name).toBe('Continue.dev')
  })

  // LiteLLM
  it('identifies litellm', () => {
    const info = identifyClient('litellm/1.50.0')
    expect(info.type).toBe('litellm')
    expect(info.name).toBe('LiteLLM')
  })

  // LangChain
  it('identifies langchain', () => {
    const info = identifyClient('langchain/0.3.0')
    expect(info.type).toBe('langchain')
    expect(info.name).toBe('LangChain')
  })

  // OpenAI Python SDK
  it('identifies openai-python', () => {
    const info = identifyClient('openai-python/1.55.0')
    expect(info.type).toBe('openai-python')
    expect(info.name).toBe('OpenAI Python SDK')
  })

  // OpenAI Node.js SDK
  it('identifies openai-node', () => {
    const info = identifyClient('openai/1.0 Node.js/20.0')
    expect(info.type).toBe('openai-node')
    expect(info.name).toBe('OpenAI Node.js SDK')
  })

  // Anthropic Python SDK
  it('identifies anthropic-python', () => {
    const info = identifyClient('anthropic-python/0.45.0')
    expect(info.type).toBe('anthropic-python')
    expect(info.name).toBe('Anthropic Python SDK')
  })

  // cURL
  it('identifies curl', () => {
    const info = identifyClient('curl/8.9.0')
    expect(info.type).toBe('curl')
    expect(info.name).toBe('cURL')
  })

  it('does not match "curl" in the middle of UA', () => {
    // must start with "curl/"
    const info = identifyClient('SomeClient/curl.anything')
    expect(info.type).toBe('unknown')
  })

  // Python httpx
  it('identifies python-httpx', () => {
    const info = identifyClient('python-httpx/1.0.0')
    expect(info.type).toBe('python-httpx')
    expect(info.name).toBe('Python (httpx)')
  })

  // Python requests
  it('identifies python-requests', () => {
    const info = identifyClient('python-requests/2.32.0')
    expect(info.type).toBe('python-requests')
    expect(info.name).toBe('Python (requests)')
  })

  // x-client-name header override
  it('uses x-client-name header over User-Agent', () => {
    const info = identifyClient('curl/8.9.0', { 'x-client-name': 'My Custom App' })
    expect(info.type).toBe('my-custom-app')
    expect(info.name).toBe('My Custom App')
    // no version when coming from x-client-name
    expect(info.version).toBeUndefined()
  })

  it('handles x-client-name with spaces in type', () => {
    const info = identifyClient(null, { 'x-client-name': 'Test Agent v2' })
    expect(info.type).toBe('test-agent-v2')
    expect(info.name).toBe('Test Agent v2')
  })

  // null / undefined / unknown UA
  it('returns unknown for null UA', () => {
    const info = identifyClient(null)
    expect(info.type).toBe('unknown')
    expect(info.name).toBe('未知客户端')
  })

  it('returns unknown for undefined UA', () => {
    const info = identifyClient(undefined)
    expect(info.type).toBe('unknown')
    expect(info.name).toBe('未知客户端')
  })

  it('returns unknown for "unknown" UA string', () => {
    const info = identifyClient('unknown')
    expect(info.type).toBe('unknown')
    expect(info.name).toBe('未知客户端')
  })

  // unknown client fallback
  it('returns unknown for unrecognized UA', () => {
    const info = identifyClient('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
    expect(info.type).toBe('unknown')
    expect(info.name).toBe('未知客户端')
    expect(info.version).toBeUndefined()
  })

  // version extraction
  it('extracts semver version from UA', () => {
    const info = identifyClient('OpenCode/1.2.3')
    expect(info.version).toBe('1.2.3')
  })

  it('extracts two-part version from UA', () => {
    const info = identifyClient('curl/8.9')
    expect(info.version).toBe('8.9')
  })

  it('extracts version when only major version is present', () => {
    const info = identifyClient('OpenCode/1')
    expect(info.version).toBeUndefined()
  })

  // CLIENT_REGISTRY
  it('exports CLIENT_REGISTRY with all known types', () => {
    expect(CLIENT_REGISTRY['claude-code']).toBe('Claude Code')
    expect(CLIENT_REGISTRY['cursor']).toBe('Cursor')
    expect(CLIENT_REGISTRY['curl']).toBe('cURL')
    expect(CLIENT_REGISTRY['unknown']).toBe('未知客户端')
  })
})

describe('resolveClientIp', () => {
  function buildApp() {
    const app = new Hono()
    app.get('/', (c) => c.text(resolveClientIp(c)))
    return app
  }

  it('prefers the first address in x-forwarded-for', async () => {
    const res = await buildApp().request('/', {
      headers: { 'x-forwarded-for': '203.0.113.5, 10.0.0.1' },
    })
    expect(await res.text()).toBe('203.0.113.5')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', async () => {
    const res = await buildApp().request('/', { headers: { 'x-real-ip': '198.51.100.7' } })
    expect(await res.text()).toBe('198.51.100.7')
  })

  it('falls back to the Bun server socket address when no proxy headers are present', async () => {
    const res = await buildApp().request('/', {}, { requestIP: () => ({ address: '192.0.2.9' }) })
    expect(await res.text()).toBe('192.0.2.9')
  })

  it('returns "unknown" when no header and no server socket info are available', async () => {
    const res = await buildApp().request('/')
    expect(await res.text()).toBe('unknown')
  })
})
