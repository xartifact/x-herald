import { describe, expect, it, beforeAll, afterAll } from 'bun:test'

import { createProxyTestEnv } from '../test/proxy-test-helpers'
import type { ProxyTestEnv } from '../test/proxy-test-helpers'
import { anthropicMessages } from '../test/mock-upstream'
import { getDatabase } from '../db/client'
import { modelGroups } from '../db'
import { eq } from '@xartifact/x-herald-db'

/**
 * 让模型组声明视觉能力。
 *
 * 路由会按能力过滤实例：`vision: false` 的组收到带图请求时直接 503
 * （`NoSuitableInstanceError: vision not supported`）。要测「多模态字段是否
 * 原样转发」，前置条件是这条链路本身允许多模态请求。
 */
async function allowVision(groupId: string): Promise<void> {
  const db = getDatabase()
  const [group] = await db.select().from(modelGroups).where(eq(modelGroups.id, groupId))
  await db
    .update(modelGroups)
    .set({ capabilities: { ...(group.capabilities as object), vision: true } })
    .where(eq(modelGroups.id, groupId))
}

/**
 * 多模态内容段端到端保真（GitHub Issue #5）。
 *
 * 单元测试证明转换函数不丢字段；这里走真实网关链路，证明**到上游的请求体**里
 * 字段确实还在。两者都需要：转换器可能被绕过（同协议透传），也可能被别的
 * 中间层再裁剪一次。
 *
 * 场景选 OpenAI 客户端 → Anthropic 上游：这是唯一强制走 normalize/adapt
 * 往返的组合，也是历史上丢字段的那条路。
 */
describe('multimodal passthrough / cross-protocol', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    env = await createProxyTestEnv({
      protocol: 'anthropic',
      accessModelName: 'lfm3-omni',
      actualModelName: 'lfm3-omni',
    })
    await allowVision(env.modelGroupId)
  })

  afterAll(async () => {
    await env.close()
  })

  it('forwards a text+image message to an anthropic upstream', async () => {
    env.upstream.setResponse(200, anthropicMessages({ content: 'OCR: hello' }))

    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
            { type: 'text', text: 'Convert to Markdown.' },
          ],
        },
      ],
    })
    expect(res.status).toBe(200)

    const sent = env.upstream.lastRequest().body as {
      messages: Array<{ content: Array<{ type: string }> }>
    }
    const types = sent.messages.flatMap((m) => m.content.map((part) => part.type))
    expect(types).toContain('image')
    expect(types).toContain('text')
  })

  it('does not drop the text part when images are present', async () => {
    env.upstream.setResponse(200, anthropicMessages({ content: 'ok' }))

    await env.proxyChat({
      model: env.accessModelName,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'BEFORE' },
            { type: 'image_url', image_url: { url: 'data:image/png;base64,BBBB' } },
            { type: 'text', text: 'AFTER' },
          ],
        },
      ],
    })

    const raw = JSON.stringify(env.upstream.lastRequest().body)
    // 两段文本都在：历史上 filter 只留 image_url 时会丢掉纯文本
    expect(raw).toContain('BEFORE')
    expect(raw).toContain('AFTER')
  })
})

/**
 * 同协议透传：body 原样转发，多模态字段天然不受转换器影响。
 * 这条用例守的是「不要为了修跨协议而把透传路径也改掉」。
 */
describe('multimodal passthrough / same-protocol', () => {
  let env: ProxyTestEnv

  beforeAll(async () => {
    process.env.GATEWAY_SAME_PROTOCOL_PASSTHROUGH = 'true'
    env = await createProxyTestEnv({
      protocol: 'openai',
      accessModelName: 'lfm3-omni',
      actualModelName: 'lfm3-omni',
    })
    await allowVision(env.modelGroupId)
  })

  afterAll(async () => {
    delete process.env.GATEWAY_SAME_PROTOCOL_PASSTHROUGH
    await env.close()
  })

  it('forwards input_audio and input_video byte-for-byte', async () => {
    env.upstream.setResponse(200, {
      choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
    })

    const content = [
      { type: 'input_video', input_video: { data: 'VIDEOBASE64', format: 'mp4' } },
      { type: 'input_audio', input_audio: { data: 'AUDIOBASE64', format: 'wav' } },
      { type: 'text', text: '视频里出现了哪些文字？' },
    ]
    const res = await env.proxyChat({
      model: env.accessModelName,
      messages: [{ role: 'user', content }],
    })
    expect(res.status).toBe(200)

    const sent = env.upstream.lastRequest().body as {
      messages: Array<{ content: Array<Record<string, unknown>> }>
    }
    expect(sent.messages[0].content).toEqual(content)
  })
})
