import { describe, it, expect } from 'bun:test'
import { resolveCapabilityRoute, sliceToStatelessMessages } from './capability-router'
import type { CapabilityActionConfig } from '@xartifact/x-herald-shared'
import type { StandardRequest } from '@xartifact/x-herald-shared'

const mockConfig: CapabilityActionConfig = {
  capabilityMap: {
    vision: 'group-vision',
    audio: 'group-audio',
    video: 'group-video',
    tool_use: 'group-tools',
    text: 'group-text',
  },
  defaultGroupId: 'group-general',
}

describe('resolveCapabilityRoute', () => {
  it('routes text requests to the text group', async () => {
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'hello' }],
    }
    const result = await resolveCapabilityRoute(req, { requestId: 'r1' }, mockConfig)
    expect(result.capabilities).toContain('text')
    expect(result.groupId).toBe('group-text')
  })

  it('routes vision requests to the vision group', async () => {
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'https://x.com/img.png' } }],
        },
      ],
    }
    const result = await resolveCapabilityRoute(req, { requestId: 'r2' }, mockConfig)
    expect(result.capabilities).toContain('vision')
    expect(result.groupId).toBe('group-vision')
  })

  it('treats input_video as video capability (llama.cpp shape)', async () => {
    // Issue #5：llama.cpp 用 input_video 而不是 video_url；漏识别会让视频请求
    // 走 default 分支被当成纯文本路由到 text 组
    const req: StandardRequest = {
      model: 'lfm3-omni',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'input_video', input_video: { data: 'AAAA', format: 'mp4' } },
            { type: 'text', text: '视频里有哪些字？' },
          ] as never,
        },
      ],
    }
    const result = await resolveCapabilityRoute(req, { requestId: 'r-video' }, mockConfig)
    expect(result.capabilities).toContain('video')
    expect(result.groupId).toBe('group-video')
  })

  it('treats video_url and input_video identically', async () => {
    const withUrl: StandardRequest = {
      model: 'm',
      messages: [
        {
          role: 'user',
          content: [{ type: 'video_url', video_url: { url: 'https://x/v.mp4' } }] as never,
        },
      ],
    }
    const withInput: StandardRequest = {
      model: 'm',
      messages: [
        {
          role: 'user',
          content: [{ type: 'input_video', input_video: { data: 'BBBB' } }] as never,
        },
      ],
    }
    const a = await resolveCapabilityRoute(withUrl, { requestId: 'a' }, mockConfig)
    const b = await resolveCapabilityRoute(withInput, { requestId: 'b' }, mockConfig)
    expect(a.groupId).toBe(b.groupId)
    expect(a.capabilities).toEqual(b.capabilities)
  })

  it('detects tool use capability', async () => {
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'check weather' }],
      tools: [
        {
          type: 'function',
          function: { name: 'get_weather', description: '', parameters: {} },
        },
      ],
    }
    const result = await resolveCapabilityRoute(req, { requestId: 'r3' }, mockConfig)
    expect(result.capabilities).toContain('tool_use')
  })

  it('selects highest priority when multiple capabilities present', async () => {
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: 'https://x.com/img.png' } },
            { type: 'text', text: 'describe this' },
          ],
        },
      ],
      tools: [
        {
          type: 'function',
          function: { name: 'x', description: '', parameters: {} },
        },
      ],
    }
    const result = await resolveCapabilityRoute(req, { requestId: 'r4' }, mockConfig)
    expect(result.capabilities).toContain('vision')
    expect(result.capabilities).toContain('tool_use')
    expect(result.selectedCapability).toBe('vision')
    expect(result.groupId).toBe('group-vision')
  })

  it('falls back to default when unknown capability', async () => {
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'hello' }],
    }
    const result = await resolveCapabilityRoute(
      req,
      { requestId: 'r5' },
      {
        capabilityMap: {},
        defaultGroupId: 'group-default',
      },
    )
    expect(result.groupId).toBe('group-default')
  })
})

describe('contextMode', () => {
  it('marks vision as stateless', async () => {
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: [{ type: 'image_url', image_url: { url: 'https://x.com/a.png' } }],
        },
      ],
    }
    const result = await resolveCapabilityRoute(req, { requestId: 'm1' }, mockConfig)
    expect(result.contextMode).toBe('stateless')
  })

  it('keeps tool_use stateful', async () => {
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [{ role: 'user', content: 'check weather' }],
      tools: [
        {
          type: 'function',
          function: { name: 'get_weather', description: '', parameters: {} },
        },
      ],
    }
    const result = await resolveCapabilityRoute(req, { requestId: 'm2' }, mockConfig)
    expect(result.contextMode).toBe('stateful')
  })

  it('does not pull a text request into vision group when image is only in history', async () => {
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: 'https://x.com/first.png' },
            },
          ],
        },
        { role: 'assistant', content: 'I saw that image' },
        { role: 'user', content: 'forget the image, draft an email' },
      ],
    }
    const result = await resolveCapabilityRoute(req, { requestId: 'm3' }, mockConfig)
    expect(result.capabilities).not.toContain('vision')
    expect(result.selectedCapability).toBe('text')
    expect(result.groupId).toBe('group-text')
  })
})

describe('sliceToStatelessMessages', () => {
  it('keeps system + last user message, drops conversation history', () => {
    const req: StandardRequest = {
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'first question' },
        { role: 'assistant', content: 'first answer' },
        { role: 'user', content: 'second question' },
      ],
    }
    expect(sliceToStatelessMessages(req)).toEqual([
      { role: 'system', content: 'You are a helpful assistant' },
      { role: 'user', content: 'second question' },
    ])
  })

  it('returns messages unchanged when empty or no user message', () => {
    expect(sliceToStatelessMessages({ model: 'x', messages: [] })).toEqual([])
    const onlyAssistant = {
      model: 'x',
      messages: [{ role: 'assistant', content: 'hi' }],
    } as unknown as StandardRequest
    expect(sliceToStatelessMessages(onlyAssistant)).toBe(onlyAssistant.messages)
  })
})
