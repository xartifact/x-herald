import type { Context, Next } from 'hono';
import logger, { isRequestLogEnabled } from '../lib/logger';

export async function requestLogger(c: Context, next: Next) {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  // 简洁模式：只在完成时输出一条日志
  await next();

  const duration = Date.now() - start;
  const status = c.res.status;

  // 检查是否启用了请求日志
  if (!isRequestLogEnabled()) {
    return;
  }

  // 简洁格式：[time] METHOD /path status duration
  logger.info(
    { method, path, status, duration },
    `${method} ${path} ${status} ${duration}ms`
  );
}
