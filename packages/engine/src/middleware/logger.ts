import type { Context, Next } from 'hono';

import rootLogger, { isRequestLogEnabled } from '../lib/logger';

const logger = rootLogger.child({ module: 'http' });

export async function requestLogger(c: Context, next: Next): Promise<void> {
  const start = Date.now();
  const method = c.req.method;
  const path = c.req.path;

  // 优先复用客户端传入的 x-request-id（支持跨服务链路追踪），否则生成新的
  const requestId = c.req.header('x-request-id') ?? crypto.randomUUID();
  c.set('requestId', requestId);

  await next();

  if (!isRequestLogEnabled()) {
    return;
  }

  const duration = Date.now() - start;
  const status = c.res.status;

  logger.info(
    { requestId, method, path, status, duration },
    `${method} ${path} ${status} ${duration}ms`
  );
}
