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
