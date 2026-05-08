import pino from 'pino';
import pretty from 'pino-pretty';

// 从环境变量读取日志配置（确保在早期就能获取）
const logLevel = process.env.LOG_LEVEL || 'info';
const enableDebug = process.env.LOG_ENABLE_DEBUG === 'true';

// 最终日志级别：如果明确启用 debug，则使用 debug，否则使用配置的级别
const finalLevel = enableDebug ? 'debug' : logLevel;
const isDev = process.env.NODE_ENV === 'development';

// pino-pretty 内置处理的 key，不走自定义 prettifier
const BUILTIN_KEYS = new Set(['level', 'time', 'hostname', 'pid', 'name', 'caller', 'err', 'error']);

const MAX_STRING_LENGTH = 120;

// 将对象序列化为单行 JSON，超长字符串做截断
function compactStringify(value: unknown): string {
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'string' && val.length > MAX_STRING_LENGTH) {
      return `${val.slice(0, MAX_STRING_LENGTH)}...(${val.length})`;
    }
    return val;
  }) ?? String(value);
}

function createPrettyStream() {
  return pretty({
    colorize: true,
    translateTime: 'SYS:yyyy-mm-dd HH:MM:ss',
    ignore: 'pid,hostname',
    // Proxy 拦截所有非内置字段：将对象序列化为单行紧凑 JSON
    customPrettifiers: new Proxy(
      {} as Record<string, (v: string | object) => string>,
      {
        get(_target, prop: string | symbol) {
          if (typeof prop !== 'string' || BUILTIN_KEYS.has(prop)) return undefined;
          return (value: unknown) =>
            typeof value === 'object' && value !== null
              ? compactStringify(value)
              : String(value);
        },
      }
    ),
  });
}

const loggerOptions: pino.LoggerOptions = {
  level: finalLevel,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
};

export const logger = isDev
  ? pino(loggerOptions, createPrettyStream())
  : pino(loggerOptions);

/**
 * 检查是否启用了请求日志
 */
export function isRequestLogEnabled(): boolean {
  return process.env.LOG_ENABLE_REQUEST !== 'false';
}

/**
 * 检查是否启用了 debug 日志
 */
export function isDebugEnabled(): boolean {
  return process.env.LOG_ENABLE_DEBUG === 'true' || logger.level === 'debug';
}

export default logger;
