import { eq } from 'drizzle-orm';
import type { Context, Next } from 'hono';

import { getDatabase } from '../db/client';
import rootLogger from '../lib/logger';
import { virtualKeys, type VirtualKey } from '../features/keys/db';

const logger = rootLogger.child({ module: 'gateway.auth' });

// globalThis singleton cache (30s TTL)
type VKCacheEntry = { value: VirtualKey; expiresAt: number };
const cache: Map<string, VKCacheEntry> =
  (globalThis as Record<string, unknown>)._vkCache as Map<string, VKCacheEntry> ?? ((globalThis as Record<string, unknown>)._vkCache = new Map()) as Map<string, VKCacheEntry>;
const CACHE_TTL_MS = 30_000;

function getCachedVirtualKey(key: string): VirtualKey | undefined {
  const entry = cache.get(key);
  if (!entry || Date.now() > entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCachedVirtualKey(key: string, value: VirtualKey): void {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

export function invalidateVirtualKeyCache(key: string): void {
  cache.delete(key);
}

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

    // Check cache first
    const cachedKey = getCachedVirtualKey(keyValue);
    if (cachedKey) {
      // Re-check enabled/expired for cached entry (quick validation)
      if (!cachedKey.enabled) {
        return c.json({ error: 'API key is disabled', code: 'KEY_DISABLED' }, 403);
      }
      if (cachedKey.expiresAt && new Date(cachedKey.expiresAt) < new Date()) {
        return c.json({ error: 'API key has expired', code: 'KEY_EXPIRED' }, 403);
      }
      c.set('virtualKey', cachedKey);
      await next();
      return;
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

    // Cache the validated key
    setCachedVirtualKey(keyValue, key);

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
