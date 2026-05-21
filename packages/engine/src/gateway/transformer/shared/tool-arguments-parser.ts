/**
 * 工具参数解析器
 * 提供三层解析策略，确保工具调用参数始终是有效的 JSON 格式
 */

import JSON5 from 'json5';
import { jsonrepair } from 'jsonrepair';

/**
 * 解析工具调用参数，使用三层策略：
 * 1. 标准 JSON.parse（快速路径）
 * 2. JSON5.parse（支持宽松语法：单引号、尾随逗号、注释）
 * 3. jsonrepair（智能修复格式错误）
 * 4. 降级返回 "{}"
 *
 * @param argsString - 待解析的参数字符串
 * @param logger - 可选的日志记录器
 * @returns 有效的 JSON 字符串
 */
export function parseToolArguments(
  argsString: string,
  logger?: {
    trace?: (obj: unknown, msg?: string) => void;
    debug?: (obj: unknown, msg?: string) => void;
    warn?: (obj: unknown, msg?: string) => void;
  }
): string {
  // 处理空输入
  if (!argsString || argsString.trim() === '') {
    logger?.debug?.({ argsString }, '工具调用参数为空，返回空对象');
    return '{}';
  }

  const trimmed = argsString.trim();

  // 第一层：标准 JSON.parse（快速路径，99% 的情况）
  try {
    const parsed = JSON.parse(trimmed);
    // 验证解析结果是对象
    if (typeof parsed === 'object' && parsed !== null) {
      logger?.trace?.({ args: parsed }, '工具调用参数标准 JSON 解析成功');
      return trimmed;
    }
  } catch (error) {
    // 继续尝试下一层
    logger?.debug?.(
      { error, argsString: trimmed },
      '标准 JSON 解析失败，尝试 JSON5'
    );
  }

  // 第二层：JSON5.parse（支持宽松语法）
  try {
    const parsed = JSON5.parse(trimmed);
    if (typeof parsed === 'object' && parsed !== null) {
      const normalized = JSON.stringify(parsed);
      logger?.debug?.(
        { args: parsed },
        '工具调用参数 JSON5 解析成功'
      );
      return normalized;
    }
  } catch (error) {
    // 继续尝试下一层
    logger?.debug?.(
      { error, argsString: trimmed },
      'JSON5 解析失败，尝试 jsonrepair'
    );
  }

  // 第三层：jsonrepair（智能修复）
  try {
    const repaired = jsonrepair(trimmed);
    const parsed = JSON.parse(repaired);
    if (typeof parsed === 'object' && parsed !== null) {
      logger?.warn?.(
        { args: parsed },
        '工具调用参数通过 jsonrepair 修复成功'
      );
      return repaired;
    }
  } catch (error) {
    // 所有尝试都失败
    logger?.warn?.(
      { error, argsString: trimmed },
      '所有解析尝试失败，返回空对象'
    );
  }

  // 第四层：安全降级
  logger?.warn?.(
    { argsString: trimmed },
    '工具调用参数无法解析，降级返回空对象'
  );
  return '{}';
}
