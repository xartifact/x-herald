/**
 * 角色归一化：按模型实例的 roleMapping 配置改写 Standard 消息的 role。
 *
 * 某些 OpenAI SDK / 兼容层会发出 Standard 类型之外的 role（如 `developer`，
 * OpenAI 较新模型支持，但 X-AIO 等上游反序列化器不识别，会导致 400）。
 * 通过 model instance config 的 `roleMapping`（如 `{ developer: 'system' }`）
 * 可在 egress 前统一改写，透明代理默认不改（未配置时原样透传）。
 */

import type { MessageRole, StandardMessage, StandardRequest } from '@xartifact/x-herald-shared'

/**
 * 应用角色映射到标准请求。
 * 仅改写 roleMapping 中显式声明的 role；未配置或未命中的消息保持不变。
 * 返回新数组，不修改原对象。
 */
export function applyRoleMapping(
  request: StandardRequest,
  roleMapping: Record<string, MessageRole> | undefined,
): StandardRequest {
  if (!roleMapping || Object.keys(roleMapping).length === 0) {
    return request
  }

  let changed = false
  const messages: StandardMessage[] = request.messages.map((msg) => {
    const mapped = roleMapping[msg.role]
    if (mapped !== undefined && mapped !== msg.role) {
      changed = true
      return { ...msg, role: mapped }
    }
    return msg
  })

  return changed ? { ...request, messages } : request
}
