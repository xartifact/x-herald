/**
 * 能力路由服务
 * 检测请求中的能力需求（视觉、TTS、Video），按能力路由到对应模型
 */
import logger from '../../lib/logger'
import type { CapabilityActionConfig } from '@xartifact/x-herald-shared'
import type { StandardRequest } from '@xartifact/x-herald-shared'

const serviceLogger = logger.child({ module: 'capability-router' })

/**
 * 已识别能力及其优先级（越高越优先路由）
 */
const CAPABILITY_PRIORITY: Record<string, number> = {
  video: 100,
  vision: 90,
  audio: 80,
  tts: 70,
  tool_use: 60,
  text: 10,
}

export interface CapabilityResult {
  capabilities: string[]
  selectedCapability: string
  groupId: string
  /**
   * 该请求的上下文语义：
   *   - 'stateless'：内容即任务（vision/audio/video），转发只带当前回合
   *   - 'stateful' ：历史即载荷（tool_use/text），保留完整历史
   */
  contextMode: 'stateless' | 'stateful'
}

/**
 * 分析请求消息内容，提取能力需求列表
 */
function extractCapabilities(request: StandardRequest): string[] {
  const caps = new Set<string>()

  // 能力检测只看「当前回合」=最后一条 user 消息。历史某轮带图、当前轮纯文本时，
  // 不应把请求错误拉进视觉组 —— 能力路由是请求自包含语义，历史里的模态内容对
  // 本次路由没有信息增益（也是无状态裁剪成立的前提）。
  for (let i = request.messages.length - 1; i >= 0; i--) {
    if (request.messages[i].role !== 'user') continue
    const content = request.messages[i].content
    if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part === 'object' && part !== null) {
          switch (part.type) {
            case 'image_url':
              caps.add('vision')
              break
            case 'input_audio':
              caps.add('audio')
              break
            case 'video_url':
              caps.add('video')
              break
          }
        }
      }
    }
    break
  }

  if (request.tools && request.tools.length > 0) {
    caps.add('tool_use')
  }

  if (caps.size === 0) caps.add('text')
  return Array.from(caps)
}

/**
 * 选择最高优先级的已识别能力
 */
function selectCapability(detected: string[], config: CapabilityActionConfig): string {
  const knownCaps = Object.keys(config.capabilityMap)
  const present = detected.filter((d) => knownCaps.includes(d))
  if (present.length === 0) return 'default'

  present.sort((a, b) => (CAPABILITY_PRIORITY[b] || 0) - (CAPABILITY_PRIORITY[a] || 0))
  return present[0]
}
/**
 * 内容即任务的「无状态」能力：识图 / 音频 / 视频这类单发请求，历史对话对结果
 * 没有信息增益，转发应只带当前回合（见 sliceToStatelessMessages）。
 *
 * tool_use 显式归为有状态 —— agent 工具循环的当前 user 消息往往引用历史里的
 * assistant tool_calls / tool_result，贸然裁剪会打断工具上下文。
 */
const CONTENT_STATELESS_CAPABILITIES: Record<string, true> = {
  vision: true,
  audio: true,
  video: true,
}

/**
 * 无状态请求的转发切片：保留 system（模型指令）+ 最后一条 user（当前回合），
 * 丢弃其余对话历史。
 *
 * 这不是有损压缩 —— 对这些单发模态任务历史本就无关，只是从源头不带上超限载荷，
 * 同时零处理开销（直接数组选择，不做任何 token 结算）。
 */
export function sliceToStatelessMessages(request: StandardRequest): StandardRequest['messages'] {
  const messages = request.messages ?? []
  if (messages.length === 0) return messages
  let lastUserIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'user') {
      lastUserIdx = i
      break
    }
  }
  if (lastUserIdx === -1) return messages
  const system = messages.filter((m) => m.role === 'system')
  return [...system, messages[lastUserIdx]]
}

/**
 * 根据请求能力需求路由到对应模型组
 */
export async function resolveCapabilityRoute(
  request: StandardRequest,
  _ctx: { requestId: string },
  config: CapabilityActionConfig,
): Promise<CapabilityResult> {
  const capabilities = extractCapabilities(request)
  const selected = selectCapability(capabilities, config)
  const groupId =
    config.capabilityMap[selected] ||
    config.defaultGroupId ||
    Object.values(config.capabilityMap)[0]
  const contextMode: 'stateless' | 'stateful' =
    selected in CONTENT_STATELESS_CAPABILITIES ? 'stateless' : 'stateful'

  serviceLogger.info(
    { capabilities, selected, groupId, contextMode },
    'Capability routing decision',
  )

  return { capabilities, selectedCapability: selected, groupId, contextMode }
}
