import { describe, expect, it } from 'bun:test'

import { convertContent, convertToOpenAIContent } from './content-converter'

/**
 * 多模态内容段必须**逐段保留**。
 *
 * 回归背景（GitHub Issue #5）：旧实现用
 * `filter(item => item.type === 'text' || item.type === 'image_url')` 再 map，
 * 音频与视频段在归一化/还原过程中被静默丢弃。上游只收到文本，
 * 表现为「模型看不见附件」——不报错，只能通过比对请求体发现。
 */
describe('openai content converter / multimodal preservation', () => {
  const audioPart = { type: 'input_audio' as const, input_audio: { data: 'AAAA', format: 'wav' } }
  const videoUrlPart = { type: 'video_url' as const, video_url: { url: 'https://x/v.mp4' } }
  const inputVideoPart = {
    type: 'input_video' as const,
    input_video: { data: 'BBBB', format: 'mp4' },
  }

  it('keeps input_audio through normalize', () => {
    const out = convertContent([audioPart])
    expect(out).toEqual([audioPart])
  })

  it('keeps video_url through normalize', () => {
    expect(convertContent([videoUrlPart])).toEqual([videoUrlPart])
  })

  it('keeps input_video (llama.cpp shape) through normalize', () => {
    expect(convertContent([inputVideoPart])).toEqual([inputVideoPart])
  })

  it('does not reshape input_video into video_url', () => {
    // 两种形状的上游接受度不同；改写等于替上游做决定
    const out = convertContent([inputVideoPart]) as Array<{ type: string }>
    expect(out[0].type).toBe('input_video')
  })

  it('preserves a mixed multimodal message in order', () => {
    const parts = [
      { type: 'text' as const, text: '描述这个视频' },
      inputVideoPart,
      audioPart,
      { type: 'image_url' as const, image_url: { url: 'data:image/png;base64,CCCC' } },
    ]
    expect(convertContent(parts)).toEqual(parts)
  })

  it('round-trips modalities without dropping optional fields', () => {
    const parts = [
      { type: 'text' as const, text: 'hi' },
      {
        type: 'image_url' as const,
        image_url: { url: 'https://x/i.png', detail: 'high' as const },
      },
      audioPart,
      videoUrlPart,
      inputVideoPart,
    ]
    // 归一化后再还原，必须与原请求等价（detail/format 等可选字段不得消失）
    const restored = convertToOpenAIContent(convertContent(parts))
    expect(restored).toEqual(parts)
  })

  it('passes through part types it does not model yet', () => {
    // 前向兼容：上游新增模态时不能再重演「静默丢弃」
    const future = { type: 'input_hologram', input_hologram: { data: 'DDDD' } }
    const out = convertContent([future as never]) as Array<{ type: string }>
    expect(out[0].type).toBe('input_hologram')
  })

  it('leaves plain string content untouched', () => {
    expect(convertContent('just text')).toBe('just text')
    expect(convertToOpenAIContent('just text')).toBe('just text')
    expect(convertContent(undefined)).toBe('')
    expect(convertToOpenAIContent(undefined)).toBeUndefined()
  })
})
