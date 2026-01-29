import type { Context, Next } from 'hono';
import { verify } from 'hono/jwt';
import { loadConfig } from '@x-llm-gateway/config';
import logger from '@/core/lib/logger';

const config = loadConfig();

/**
 * JWT 认证中间件 - 保护管理员 API
 */
export async function authMiddleware(c: Context, next: Next) {
  try {
    // 从 header 获取 token
    const authHeader = c.req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return c.json(
        {
          error: 'Missing or invalid authorization header',
          code: 'UNAUTHORIZED',
        },
        401
      );
    }

    const token = authHeader.substring(7);

    // 验证 token
    const payload = await verify(token, config.admin.password, 'HS256');

    // 将用户信息存储到 context
    c.set('user', payload);

    await next();
  } catch (error) {
    logger.error({ error }, 'Authentication failed');
    return c.json(
      {
        error: 'Invalid or expired token',
        code: 'INVALID_TOKEN',
      },
      401
    );
  }
}

/**
 * 可选认证中间件 - 不强制要求认证，但如果有 token 会验证
 */
export async function optionalAuthMiddleware(c: Context, next: Next) {
  try {
    const authHeader = c.req.header('Authorization');

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = await verify(token, config.admin.password, 'HS256');
      c.set('user', payload);
    }

    await next();
  } catch (error) {
    // 验证失败，继续处理（作为未认证用户）
    logger.warn({ error }, 'Optional auth failed, continuing as unauthenticated');
    await next();
  }
}
