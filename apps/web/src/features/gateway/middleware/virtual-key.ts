import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';

import { getDatabase } from '@/core/db/client';
import rootLogger from '@/core/lib/logger';

const logger = rootLogger.child({ module: 'gateway.auth' });
import { virtualKeys } from '@/features/keys/db';

/**
 * 虚拟密钥认证中间件 - 验证 API 请求中的 x-api-key 或 Authorization
 */
export async function virtualKeyMiddleware(c: Context, next: Next) {
  try {
    // 从 header 获取密钥
    const authHeader = c.req.header('Authorization');
    const apiKeyHeader = c.req.header('x-api-key');

    let keyValue: string | null = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      keyValue = authHeader.substring(7);
    } else if (apiKeyHeader) {
      keyValue = apiKeyHeader;
    }

    if (!keyValue) {
      return c.json(
        {
          error: 'Missing API key. Provide it via Authorization: Bearer <key> or x-api-key header',
          code: 'UNAUTHORIZED',
        },
        401
      );
    }

    const db = getDatabase();

    // 查询密钥
    const keys = await db
      .select()
      .from(virtualKeys)
      .where(eq(virtualKeys.key, keyValue))
      .limit(1);

    if (!keys || keys.length === 0) {
      return c.json(
        {
          error: 'Invalid API key',
          code: 'INVALID_KEY',
        },
        401
      );
    }

    const key = keys[0];

    // 检查密钥是否启用
    if (!key.enabled) {
      return c.json(
        {
          error: 'API key is disabled',
          code: 'KEY_DISABLED',
        },
        403
      );
    }

    // 检查密钥是否过期
    if (key.expiresAt && new Date(key.expiresAt) < new Date()) {
      return c.json(
        {
          error: 'API key has expired',
          code: 'KEY_EXPIRED',
        },
        403
      );
    }

    // 将密钥信息存储到 context
    c.set('virtualKey', key);

    await next();
  } catch (error) {
    logger.warn({ err: error }, 'Virtual key authentication failed');
    return c.json(
      {
        error: 'Authentication failed',
        code: 'AUTH_ERROR',
      },
      500
    );
  }
}
