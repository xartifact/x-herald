import { Hono } from 'hono';

import { rootLogger } from '../../lib';

import { rateLimitEngine } from '../../gateway/services/rate-limit-engine';

import { createKey, deleteKey, getKey, listKeys, resetKey, updateKey } from './service';

const logger = rootLogger.child({ module: 'keys' });

const keysRoutes = new Hono();

keysRoutes.get('/', async (c) => {
  try {
    const data = await listKeys();
    return c.json({ success: true, data, total: data.length });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list virtual keys');
    return c.json({ error: 'Failed to list virtual keys', code: 'KEYS_LIST_ERROR' }, 500);
  }
});

keysRoutes.get('/:id', async (c) => {
  try {
    const key = await getKey(c.req.param('id'));
    if (!key) return c.json({ error: 'Virtual key not found', code: 'KEY_NOT_FOUND' }, 404);
    return c.json({ success: true, data: key });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get virtual key');
    return c.json({ error: 'Failed to get virtual key', code: 'KEY_GET_ERROR' }, 500);
  }
});

keysRoutes.post('/', async (c) => {
  try {
    const body = await c.req.json();
    if (!body.name) return c.json({ error: 'Missing required field: name', code: 'VALIDATION_ERROR' }, 400);
    const data = await createKey(body);
    return c.json({ success: true, data }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create virtual key');
    return c.json({ error: 'Failed to create virtual key', code: 'KEY_CREATE_ERROR' }, 500);
  }
});

keysRoutes.put('/:id', async (c) => {
  try {
    const data = await updateKey(c.req.param('id'), await c.req.json());
    if (!data) return c.json({ error: 'Virtual key not found', code: 'KEY_NOT_FOUND' }, 404);
    return c.json({ success: true, data });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update virtual key');
    return c.json({ error: 'Failed to update virtual key', code: 'KEY_UPDATE_ERROR' }, 500);
  }
});

keysRoutes.delete('/:id', async (c) => {
  try {
    const deleted = await deleteKey(c.req.param('id'));
    if (!deleted) return c.json({ error: 'Virtual key not found', code: 'KEY_NOT_FOUND' }, 404);
    return c.json({ success: true, message: 'Virtual key deleted successfully' });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete virtual key');
    return c.json({ error: 'Failed to delete virtual key', code: 'KEY_DELETE_ERROR' }, 500);
  }
});

keysRoutes.post('/:id/reset', async (c) => {
  try {
    const data = await resetKey(c.req.param('id'));
    if (!data) return c.json({ error: 'Virtual key not found', code: 'KEY_NOT_FOUND' }, 404);
    return c.json({ success: true, data, message: 'API key has been reset successfully' });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to reset virtual key');
    return c.json({ error: 'Failed to reset virtual key', code: 'KEY_RESET_ERROR' }, 500);
  }
});

keysRoutes.get('/:id/usage', async (c) => {
  try {
    const key = await getKey(c.req.param('id'));
    if (!key) return c.json({ error: 'Virtual key not found', code: 'KEY_NOT_FOUND' }, 404);

    const status = rateLimitEngine.getStatus(key.id, {
      rpm: key.rateLimitRpm,
      rpd: key.rateLimitRpd,
      tokenLimitDaily: key.tokenLimitDaily != null ? Number(key.tokenLimitDaily) : null,
    });

    return c.json({ success: true, data: { keyId: key.id, ...status } });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get key usage');
    return c.json({ error: 'Failed to get key usage', code: 'KEY_USAGE_ERROR' }, 500);
  }
});

keysRoutes.post('/:id/reset-usage', async (c) => {
  try {
    const key = await getKey(c.req.param('id'));
    if (!key) return c.json({ error: 'Virtual key not found', code: 'KEY_NOT_FOUND' }, 404);

    const body = await c.req.json().catch(() => ({}));
    const window = body.window || 'all';

    rateLimitEngine.resetKey(key.id, window);

    return c.json({ success: true, message: `Rate limit counters reset for window: ${window}` });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to reset key usage');
    return c.json({ error: 'Failed to reset key usage', code: 'KEY_USAGE_RESET_ERROR' }, 500);
  }
});

export default keysRoutes;