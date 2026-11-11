import { describe, it, expect, beforeAll, afterAll, afterEach } from 'bun:test'

import { createProxyTestEnv } from '../test/proxy-test-helpers'
import type { ProxyTestEnv } from '../test/proxy-test-helpers'
import { getDatabase } from '../db/client'
import { requestLogs, accessModels, virtualKeys } from '../db'
import { desc, eq } from '@xartifact/x-herald-db'
import { circuitBreakerRegistry } from '../gateway/services/circuit-breaker'

/**
 * 音频能力全链路测试（需求 docs/audio-capability-requirements.md §6）。
 *
 * 覆盖：multipart 透传 + model 改写、二进制流式下行、错误语义
 * （400 / 401 / 404 / 413 / 502 / 504）、failover、日志隐去音频内容、
 * `/v1/models` 的音频能力位。
 */

/** 轮询直到条件成立（等待真实状态变化，不猜时长） */
async function waitFor(check: () => Promise<boolean>, timeoutMs = 5_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await check()) return
    await Bun.sleep(25)
  }
  throw new Error('condition not met before timeout')
}

const WAV_BYTES = new Uint8Array([
  0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x41, 0x56, 0x45, 0x66, 0x6d, 0x74, 0x20,
])

function transcriptionForm(model: string, bytes: Uint8Array = WAV_BYTES): FormData {
  const form = new FormData()
  form.append('file', new Blob([bytes], { type: 'audio/wav' }), 'sample.wav')
  form.append('model', model)
  form.append('response_format', 'json')
  return form
}

/** 上游收到的 multipart body 里 model 字段是否被改写为实机模型名 */
function multipartModelField(rawBody: unknown): string | null {
  if (typeof rawBody !== 'string') return null
  const match = /name="model"\r\n\r\n([^\r]*)\r\n/.exec(rawBody)
  return match?.[1] ?? null
}

describe('audio / transcriptions', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'sensevoice-small',
      actualModelName: 'sensevoice-ctc',
      category: 'asr',
    })
    // 音频协议 + 端点都挂在同一 provider 上（真实部署同理：一个上游两种能力）
    const db = getDatabase()
    const [provider] = await db
      .select()
      .from((await import('../db')).providers)
      .where(eq((await import('../db')).providers.id, env.providerId))
    await db
      .update((await import('../db')).providers)
      .set({
        protocols: {
          ...provider.protocols,
          asr: { baseUrl: env.upstream.url, enabled: true, endpoint: '/inference' },
          tts: { baseUrl: env.upstream.url, enabled: true },
        },
      })
      .where(eq((await import('../db')).providers.id, env.providerId))
  })

  afterEach(() => {
    env.upstream.reset()
    env.upstream.clearRequests()
  })

  afterAll(async () => {
    await env.close()
  })

  it('transcribes audio, rewriting only the model field', async () => {
    env.upstream.setResponse(200, { text: '帮我用 Codex 修一下登录页面的 Bug。' })

    const res = await env.proxyTranscription(transcriptionForm(env.accessModelName))

    expect(res.status).toBe(200)
    const body = (await res.json()) as { text: string }
    expect(body.text.length).toBeGreaterThan(0)

    const upstreamRequest = env.upstream.lastRequest()
    // 上游端点取 provider.protocols.asr.endpoint
    expect(upstreamRequest.url).toEndWith('/inference')
    // multipart 未被重新序列化：model 被改写，其余字段仍在
    expect(multipartModelField(upstreamRequest.body)).toBe('sensevoice-ctc')
    expect(upstreamRequest.body).toContain('sample.wav')
    expect(upstreamRequest.headers['content-type']).toContain('multipart/form-data')
    // 音频字节原样转发（WAV 魔数仍在）
    expect(upstreamRequest.body).toContain('RIFF')
  })

  it('records audio duration and byte counts without storing the transcript', async () => {
    env.upstream.setResponse(200, {
      text: '别记录我',
      language: 'zh',
      duration: 3.42,
    })

    const res = await env.proxyTranscription(transcriptionForm(env.accessModelName))
    expect(res.status).toBe(200)
    await res.text()

    // 日志在响应流结束后才收尾（首字节不被观测阻塞），因此等它落库而不是立刻查
    const db = getDatabase()
    let log: typeof requestLogs.$inferSelect | undefined
    await waitFor(async () => {
      // 该 describe 前面还有别的请求行；只认最新一条（本次请求）
      const rows = await db
        .select()
        .from(requestLogs)
        .where(eq(requestLogs.modelName, env.accessModelName))
        .orderBy(desc(requestLogs.createdAt))
      log = rows[0]
      const audio = (log?.metadata as { audio?: Record<string, unknown> } | null)?.audio
      return audio?.durationSeconds !== undefined
    })
    const audio = (log?.metadata as { audio?: Record<string, unknown> } | null)?.audio
    expect(audio?.durationSeconds).toBe(3.42)
    expect(audio?.inputBytes).toBeGreaterThan(0)
    expect(JSON.stringify(log)).not.toContain('别记录我')
  })

  it('returns 400 with OpenAI error shape when file is missing', async () => {
    const form = new FormData()
    form.append('model', env.accessModelName)

    const res = await env.proxyTranscription(form)

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { type: string; message: string } }
    expect(body.error.type).toBe('invalid_request_error')
    expect(body.error.message).toContain('file')
  })

  it('returns 400 when model is missing', async () => {
    const form = new FormData()
    form.append('file', new Blob([WAV_BYTES], { type: 'audio/wav' }), 'a.wav')

    const res = await env.proxyTranscription(form)

    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toContain('model')
  })

  it('returns 413 when the upload exceeds the size limit', async () => {
    const huge = new Uint8Array(26 * 1024 * 1024)
    const res = await env.proxyTranscription(transcriptionForm(env.accessModelName, huge))

    expect(res.status).toBe(413)
  })

  it('returns 401 for an invalid virtual key', async () => {
    const res = await env.app.request('/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: 'Bearer xg_invalid_key' },
      body: transcriptionForm(env.accessModelName),
    })

    expect(res.status).toBe(401)
  })

  it('returns 404 when the model is not in allowedModels', async () => {
    const restrictedKey = `xg_restricted_${crypto.randomUUID().slice(0, 8)}`
    await getDatabase()
      .insert(virtualKeys)
      .values({
        key: restrictedKey,
        name: 'restricted-key',
        enabled: true,
        allowedModels: ['other-model'],
      })

    const res = await env.app.request('/api/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${restrictedKey}` },
      body: transcriptionForm(env.accessModelName),
    })

    expect(res.status).toBe(404)
  })

  it('fails over to the next candidate when upstream returns 5xx', async () => {
    const db = getDatabase()
    const [group] = await db
      .select()
      .from((await import('../db')).modelGroups)
      .where(eq((await import('../db')).modelGroups.id, env.modelGroupId))
    // 追加一个必失败的实例，排在原实例之后
    const [brokenProvider] = await db
      .insert((await import('../db')).providers)
      .values({
        name: 'Broken ASR Provider',
        protocols: {
          asr: { baseUrl: 'http://127.0.0.1:1', enabled: true },
        },
        enabled: true,
      })
      .returning()
    const [brokenInstance] = await db
      .insert((await import('../db')).modelInstances)
      .values({
        providerId: brokenProvider.id,
        name: 'broken-asr',
        actualModelName: 'broken-model',
        weight: 1,
        enabled: true,
      })
      .returning()
    await db.insert((await import('../db')).modelGroupMemberships).values({
      groupId: group.id,
      instanceId: brokenInstance.id,
    })

    env.upstream.setResponse(200, { text: 'ok from first candidate' })
    const res = await env.proxyTranscription(transcriptionForm(env.accessModelName))

    expect(res.status).toBe(200)
    expect(((await res.json()) as { text: string }).text).toBe('ok from first candidate')
  })
})

describe('audio / speech', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'kokoro-zh',
      actualModelName: 'kokoro-v1',
      category: 'tts',
    })
    const db = getDatabase()
    const { providers } = await import('../db')
    const [provider] = await db.select().from(providers).where(eq(providers.id, env.providerId))
    await db
      .update(providers)
      .set({
        protocols: {
          ...provider.protocols,
          tts: { baseUrl: env.upstream.url, enabled: true },
        },
      })
      .where(eq(providers.id, env.providerId))
  })

  afterEach(() => {
    env.upstream.reset()
    env.upstream.clearRequests()
  })

  afterAll(async () => {
    await env.close()
  })

  it('streams binary audio back with the upstream content-type', async () => {
    const audioBytes = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x01, 0x02, 0x03])
    env.upstream.setHandler(
      () =>
        new Response(audioBytes, {
          status: 200,
          headers: { 'Content-Type': 'audio/wav' },
        }),
    )

    const res = await env.proxySpeech({
      model: env.accessModelName,
      input: '你好，世界',
      voice: 'alloy',
      response_format: 'wav',
    })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('audio/wav')
    const bytes = new Uint8Array(await res.arrayBuffer())
    expect(Array.from(bytes)).toEqual(Array.from(audioBytes))

    const upstreamRequest = env.upstream.lastRequest()
    // mock upstream 已按 JSON 解析过 body，这里直接读对象
    const sent = upstreamRequest.body as Record<string, unknown>
    expect(sent.model).toBe('kokoro-v1')
    expect(sent.input).toBe('你好，世界')
    expect(sent.voice).toBe('alloy')
  })

  it('forwards the first audio chunk before the upstream stream finishes', async () => {
    const encoder = new TextEncoder()
    let releaseRest: (() => void) | null = null
    env.upstream.setHandler(() => {
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('RIFF-first-chunk'))
          releaseRest = () => {
            controller.enqueue(encoder.encode('-tail'))
            controller.close()
          }
        },
      })
      return new Response(stream, { status: 200, headers: { 'Content-Type': 'audio/wav' } })
    })

    const res = await env.proxySpeech({ model: env.accessModelName, input: '长文本' })
    expect(res.status).toBe(200)

    const reader = res.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe('RIFF-first-chunk')
    // 首块已到达客户端，上游尚未结束 → 证明没有整体缓冲
    releaseRest!()
    let rest = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      rest += new TextDecoder().decode(value)
    }
    expect(rest).toBe('-tail')
  })

  it('returns 400 when input is missing', async () => {
    const res = await env.proxySpeech({ model: env.accessModelName })
    expect(res.status).toBe(400)
    const body = (await res.json()) as { error: { message: string } }
    expect(body.error.message).toContain('input')
  })

  it('returns 504 when upstream exceeds the TTFB budget', async () => {
    env.upstream.setDelayedResponse(70_000, 200, { ok: true })
    // 非流式全局预算是 60s；直接把 startTime 推远会绕过真实链路，这里缩短实例超时
    const db = getDatabase()
    const { modelInstances } = await import('../db')
    await db
      .update(modelInstances)
      .set({
        config: { timeoutConfig: { ttfbTimeoutMs: 300 } },
      })
      .where(eq(modelInstances.id, env.instanceId))

    const res = await env.proxySpeech({ model: env.accessModelName, input: '超时测试' })

    expect(res.status).toBe(504)
    const body = (await res.json()) as { error: { type: string } }
    expect(body.error.type).toBe('upstream_timeout')

    const logs = await getDatabase()
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.modelName, 'kokoro-zh'))
    const failed = logs.filter((l) => l.status === 'failure')
    expect(failed.length).toBeGreaterThan(0)
    expect(failed.at(-1)?.failoverReason).toBe('ttfb_timeout')
    // 需求 §6 #8：504 且日志记录 errorType
    expect(failed.at(-1)?.errorType).toBe('upstream_timeout')
  }, 60_000)

  it('maps upstream 5xx to 502 with an OpenAI error shape', async () => {
    env.upstream.setHandler(
      () =>
        new Response('CUDA out of memory', {
          status: 500,
          headers: { 'Content-Type': 'text/plain' },
        }),
    )

    const res = await env.proxySpeech({ model: env.accessModelName, input: '上游崩溃' })

    expect(res.status).toBe(502)
    // 上游是纯文本；客户端仍应拿到 JSON 错误结构
    expect(res.headers.get('content-type')).toContain('application/json')
    const body = (await res.json()) as { error: { type: string; message: string } }
    expect(body.error.type).toBe('provider_error')
    expect(body.error.message).toContain('CUDA out of memory')
  })

  it('returns 502 when upstream is unreachable', async () => {
    // 前面的失败用例可能已把该实例打进熔断；这里要测的是「上游不可达」本身
    circuitBreakerRegistry.reset()
    env.upstream.close()
    const res = await env.proxySpeech({ model: env.accessModelName, input: '不可达' })
    expect(res.status).toBe(502)
    const body = (await res.json()) as { error: { type: string } }
    expect(body.error.type).toBe('upstream_unreachable')

    const logs = await getDatabase()
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.modelName, 'kokoro-zh'))
    const failed = logs.filter((l) => l.status === 'failure')
    expect(failed.at(-1)?.errorType).toBe('upstream_unreachable')
  })

  it('never stores audio content or transcript text in request logs', async () => {
    env.upstream.setResponse(200, { text: 'SECRET_TRANSCRIPT_TEXT' })
    // 复用 ASR 端点验证日志脱敏（同一 logRequest 实现）
    const asrEnv = await createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'asr-log-model',
      actualModelName: 'asr-log-upstream',
      category: 'asr',
    })
    try {
      const db = getDatabase()
      const { providers } = await import('../db')
      const [provider] = await db
        .select()
        .from(providers)
        .where(eq(providers.id, asrEnv.providerId))
      await db
        .update(providers)
        .set({
          protocols: {
            ...provider.protocols,
            asr: { baseUrl: asrEnv.upstream.url, enabled: true },
          },
        })
        .where(eq(providers.id, asrEnv.providerId))
      asrEnv.upstream.setResponse(200, { text: 'SECRET_TRANSCRIPT_TEXT' })

      const res = await asrEnv.proxyTranscription(transcriptionForm('asr-log-model'))
      expect(res.status).toBe(200)

      const [log] = await db
        .select()
        .from(requestLogs)
        .where(eq(requestLogs.modelName, 'asr-log-model'))
      expect(log).toBeTruthy()
      expect(log.requestCategory).toBe('asr')
      const serialized = JSON.stringify(log)
      expect(serialized).not.toContain('SECRET_TRANSCRIPT_TEXT')
      const audio = (log.metadata as { audio?: { inputBytes?: number } } | null)?.audio
      expect(audio?.inputBytes).toBe(WAV_BYTES.byteLength)
    } finally {
      await asrEnv.close()
    }
  })
})

describe('audio / models discovery', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'tts-model-listed',
      actualModelName: 'tts-upstream',
      category: 'tts',
    })
  })

  afterAll(async () => {
    await env.close()
  })

  it('exposes audio capability flags for audio model groups', async () => {
    const db = getDatabase()
    // 该接入模型的 capabilities 由组继承（access model 未单独设置 capabilities 时不覆盖）
    await db
      .update(accessModels)
      .set({ capabilities: null })
      .where(eq(accessModels.id, env.accessModelId))

    const res = await env.app.request('/api/v1/models', {
      headers: { Authorization: `Bearer ${env.virtualKey}` },
    })
    expect(res.status).toBe(200)

    const body = (await res.json()) as {
      data: Array<{ id: string; capabilities: Record<string, boolean> }>
    }
    const entry = body.data.find((m) => m.id === env.accessModelName)
    expect(entry).toBeTruthy()
    expect(entry!.capabilities.tts).toBe(true)
  })
})
