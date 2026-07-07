/**
 * 参数转换引擎
 * 解析并执行 InstanceConfig 中定义的 parameterTransforms 规则
 */

import logger from '../../../lib/logger'
// TODO(3.6): update import when features move to engine
import type { InstanceConfig } from '../../../features/model-groups/db'
import type { StandardRequest, TransformerContext } from '@xartifact/x-llm-gateway-shared'

/**
 * 参数转换规则
 */
export interface ParameterTransformRule {
  // 匹配条件
  when?: {
    paramName: string
    operator: 'eq' | 'ne' | 'exists' | 'not_exists'
    value?: unknown
  }
  // 转换操作
  action: {
    type: 'add' | 'remove' | 'rename' | 'transform'
    targetParam: string
    value?: unknown
    // 简单表达式支持，如: "${reasoning.enabled} ? true : false"
    expression?: string
  }
}

/**
 * 求值简单表达式
 * 支持格式: "${path.to.value} ? true : false" 或 "${path.to.value}"
 * @param expression 表达式字符串
 * @param request 标准请求对象
 * @returns 求值结果
 */
function evaluateExpression(expression: string, request: StandardRequest): unknown {
  try {
    // 提取 ${...} 中的路径
    const match = expression.match(/^\$\{([^}]+)\}\s*(.*)$/)
    if (!match) {
      return expression
    }

    const path = match[1].trim()
    const rest = match[2].trim()

    // 从请求中获取值
    const value = getValueByPath(request as unknown as Record<string, unknown>, path)

    // 处理三元表达式
    if (rest.startsWith('?')) {
      const condition = value !== undefined && value !== null && value !== false
      const parts = rest.slice(1).split(':')
      const trueValue = parseValue(parts[0]?.trim() ?? 'true')
      const falseValue = parseValue(parts[1]?.trim() ?? 'false')
      return condition ? trueValue : falseValue
    }

    return value
  } catch (error) {
    logger.warn({ error, expression }, 'Failed to evaluate expression')
    return undefined
  }
}

/**
 * 根据路径获取对象值
 * 支持嵌套路径如 "reasoning.enabled"
 */
export function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj

  for (const part of parts) {
    if (current === null || current === undefined) {
      return undefined
    }
    if (typeof current !== 'object') {
      return undefined
    }
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * 解析字符串值为适当的类型
 */
function parseValue(value: string): unknown {
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null') return null
  if (value === 'undefined') return undefined

  // 尝试解析为数字
  const num = Number(value)
  if (!Number.isNaN(num) && value !== '') {
    return num
  }

  // 移除引号
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }

  return value
}

/**
 * 检查条件是否匹配
 */
function checkCondition(
  condition: NonNullable<ParameterTransformRule['when']>,
  request: StandardRequest,
): boolean {
  const { paramName, operator, value } = condition
  const actualValue = getValueByPath(request as unknown as Record<string, unknown>, paramName)

  switch (operator) {
    case 'eq':
      return actualValue === value
    case 'ne':
      return actualValue !== value
    case 'exists':
      return actualValue !== undefined && actualValue !== null
    case 'not_exists':
      return actualValue === undefined || actualValue === null
    default:
      return false
  }
}

/**
 * 应用参数转换规则
 * @param request 标准请求
 * @param transforms 转换规则列表
 * @param ctx 转换上下文
 * @returns 转换后的请求（原地修改）
 */
export function applyParameterTransforms(
  request: StandardRequest,
  transforms: InstanceConfig['parameterTransforms'],
  ctx: TransformerContext,
): StandardRequest {
  if (!transforms || transforms.length === 0) {
    return request
  }

  // 使用深拷贝避免修改原始对象
  const req: Record<string, unknown> = { ...request }

  for (const rule of transforms) {
    try {
      // 检查条件
      if (rule.when && !checkCondition(rule.when, request)) {
        continue
      }

      const { action } = rule

      switch (action.type) {
        case 'add': {
          // 添加参数
          let value = action.value
          if (action.expression) {
            value = evaluateExpression(action.expression, request)
          }
          if (value !== undefined) {
            setValueByPath(req, action.targetParam, value)
            logger.debug(
              { requestId: ctx.requestId, param: action.targetParam, value },
              'Parameter transform: add',
            )
          }
          break
        }

        case 'remove': {
          // 移除参数
          removeValueByPath(req, action.targetParam)
          logger.debug(
            { requestId: ctx.requestId, param: action.targetParam },
            'Parameter transform: remove',
          )
          break
        }

        case 'rename': {
          // 重命名参数（原参数名在 expression 中指定）
          if (action.expression) {
            const oldValue = getValueByPath(req, action.expression)
            if (oldValue !== undefined) {
              setValueByPath(req, action.targetParam, oldValue)
              removeValueByPath(req, action.expression)
              logger.debug(
                { requestId: ctx.requestId, from: action.expression, to: action.targetParam },
                'Parameter transform: rename',
              )
            }
          }
          break
        }

        case 'transform': {
          // 转换现有参数的值
          const currentValue = getValueByPath(req, action.targetParam)
          if (currentValue !== undefined && action.expression) {
            const newValue = evaluateExpression(action.expression, request)
            if (newValue !== undefined) {
              setValueByPath(req, action.targetParam, newValue)
              logger.debug(
                {
                  requestId: ctx.requestId,
                  param: action.targetParam,
                  from: currentValue,
                  to: newValue,
                },
                'Parameter transform: transform',
              )
            }
          }
          break
        }
      }
    } catch (error) {
      logger.warn(
        { error, requestId: ctx.requestId, rule },
        'Failed to apply parameter transform rule',
      )
    }
  }

  return req as unknown as StandardRequest
}

/**
 * 根据路径设置对象值
 * 支持嵌套路径如 "reasoning.enabled"
 */
export function setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.')
  let current = obj

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {}
    }
    current = current[part] as Record<string, unknown>
  }

  current[parts[parts.length - 1]] = value
}

/**
 * 根据路径移除对象值
 * 支持嵌套路径如 "reasoning.enabled"
 */
function removeValueByPath(obj: Record<string, unknown>, path: string): void {
  const parts = path.split('.')
  let current: unknown = obj

  for (let i = 0; i < parts.length - 1; i++) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return
    }
    current = (current as Record<string, unknown>)[parts[i]]
  }

  if (current !== null && current !== undefined && typeof current === 'object') {
    delete (current as Record<string, unknown>)[parts[parts.length - 1]]
  }
}

/**
 * 构建请求头，合并自定义头
 */
export function buildHeaders(
  baseHeaders: Record<string, string>,
  customHeaders: InstanceConfig['customHeaders'],
  ctx: TransformerContext,
): Record<string, string> {
  const headers = { ...baseHeaders }

  if (customHeaders) {
    for (const [key, value] of Object.entries(customHeaders)) {
      // 删除已有的同名 key（忽略大小写），避免大小写不一致导致重复
      const lowerKey = key.toLowerCase()
      for (const existing of Object.keys(headers)) {
        if (existing.toLowerCase() === lowerKey) {
          delete headers[existing]
        }
      }
      // 支持简单的变量替换
      headers[key] = value.replace(/\$\{requestId\}/g, ctx.requestId)
    }

    logger.debug(
      { requestId: ctx.requestId, customHeaders: Object.keys(customHeaders) },
      'Applied custom headers',
    )
  }

  return headers
}

/**
 * 应用请求注入，将 instanceConfig.requestInject 合并到请求体
 */
export function applyRequestInject(
  body: Record<string, unknown>,
  inject: Record<string, unknown> | undefined,
): Record<string, unknown> {
  if (!inject) return body
  return { ...body, ...inject }
}
