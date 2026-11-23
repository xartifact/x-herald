import type { MessageContent } from '@xartifact/x-herald-shared'

import type { OpenAIContentPart } from '../types'

/**
 * OpenAI content ↔ 标准 content 的转换。
 *
 * 原则：**只做形状适配，不做内容裁决**。
 *
 * 历史实现用 `filter(item => item.type === 'text' || item.type === 'image_url')`
 * 再 `map`，等于把音频与视频段**静默丢弃**——客户端发来的 `input_audio` /
 * `input_video` / `video_url` 在转发时就消失了，上游只看到文本，表现为「模型看不见
 * 附件」。这类丢失不报错，只能靠比对请求体发现，因此这里逐段保留：
 * 认识的规范化，不认识的原样带过去。
 *
 * 为什么不把 `input_video` 改写成 `video_url`：两者上游接受度不同（llama.cpp 认
 * `input_video` 且允许 `file://`，OpenAI 系只有 `video_url`）。改写等于替上游做
 * 决定，正确做法是保持原形状，让目标上游自己判断。
 *
 * 收窄用类型守卫而不是 `switch`：`OpenAIContentPart` 含前向兼容的兜底成员，
 * 判别式收窄会失效；守卫显式声明目标是哪种 part，读起来也更直接。
 */

type TextPart = { type: 'text'; text: string }
type ImagePart = { type: 'image_url'; image_url: { url: string; detail?: 'auto' | 'low' | 'high' } }
type AudioPart = { type: 'input_audio'; input_audio: { data: string; format: string } }
type VideoUrlPart = { type: 'video_url'; video_url: { url: string } }
type InputVideoPart = {
  type: 'input_video'
  input_video: { data?: string; url?: string; format?: string }
}

const isTextPart = (part: OpenAIContentPart): part is TextPart => part.type === 'text'
const isImagePart = (part: OpenAIContentPart): part is ImagePart => part.type === 'image_url'
const isAudioPart = (part: OpenAIContentPart): part is AudioPart => part.type === 'input_audio'
const isVideoUrlPart = (part: OpenAIContentPart): part is VideoUrlPart => part.type === 'video_url'
const isInputVideoPart = (part: OpenAIContentPart): part is InputVideoPart =>
  part.type === 'input_video'

/** OpenAI part → 标准 content 段 */
export function convertContent(
  content: string | OpenAIContentPart[] | undefined,
): string | MessageContent[] {
  if (!content) return ''
  if (typeof content === 'string') return content

  return content.map((part): MessageContent => {
    if (isTextPart(part)) return { type: 'text', text: part.text }
    if (isImagePart(part)) return { type: 'image_url', image_url: part.image_url }
    if (isAudioPart(part)) return { type: 'input_audio', input_audio: part.input_audio }
    if (isVideoUrlPart(part)) return { type: 'video_url', video_url: part.video_url }
    if (isInputVideoPart(part)) return { type: 'input_video', input_video: part.input_video }
    // 前向兼容：未识别的 part 原样保留，避免上游新增模态时又被静默丢弃
    return part as unknown as MessageContent
  })
}

/** 标准 content 段 → OpenAI part */
export function convertToOpenAIContent(
  msgContent: string | MessageContent[] | undefined,
): string | OpenAIContentPart[] | undefined {
  if (msgContent === undefined) return undefined
  if (typeof msgContent === 'string') return msgContent

  // 标准层与 OpenAI part 的字段名同构（text / image_url / input_audio / video_url /
  // input_video），因此这里无需逐案重建对象：重建会丢掉 detail、format、cache_control
  // 等可选字段，正是历史上字段消失的成因之一。
  return msgContent as unknown as OpenAIContentPart[]
}
