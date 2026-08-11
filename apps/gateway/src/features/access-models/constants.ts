import type { ModelCapabilities } from '../model-groups/db'

export const CATCHALL_VM_NAME = '__catchall__'

/**
 * 接入模型 (Access Model) 的默认能力配置。
 *
 * - 所有能力开关默认打开
 * - 上下文窗口默认为 1,000,000 tokens
 */
export const DEFAULT_ACCESS_MODEL_CAPABILITIES: ModelCapabilities = {
  streaming: true,
  functionCalling: true,
  vision: true,
  jsonMode: true,
  reasoning: true,
  contextWindow: 1_000_000,
  maxTokens: 0,
}
