import pino from 'pino';

// 从环境变量读取日志配置（确保在早期就能获取）
const logLevel = process.env.LOG_LEVEL || 'info';
const enableDebug = process.env.LOG_ENABLE_DEBUG === 'true';

// 最终日志级别：如果明确启用 debug，则使用 debug，否则使用配置的级别
const finalLevel = enableDebug ? 'debug' : logLevel;

export const logger = pino({
  level: finalLevel,
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  transport: process.env.NODE_ENV === 'development' ? {
    target: 'pino-pretty',
    options: {
      colorize: true,
      translateTime: 'HH:MM:ss',
      ignore: 'pid,hostname',
    },
  } : undefined,
});

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
