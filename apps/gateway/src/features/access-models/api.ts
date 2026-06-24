import { Hono } from 'hono';

import { rootLogger } from '../../lib';

import {
  listAccessModels,
  getAccessModel,
  createAccessModel,
  updateAccessModel,
  deleteAccessModel,
  toggleAccessModel,
} from './service';

const logger = rootLogger.child({ module: 'access-models' });

const accessModelRoutes = new Hono();

accessModelRoutes.get('/', async (c) => {
  try {
    const results = await listAccessModels();
    return c.json({ success: true, data: results });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list access models');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

accessModelRoutes.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const result = await getAccessModel(id);
    if (!result) return c.json({ success: false, error: 'Access model not found' }, 404);
    return c.json({ success: true, data: result });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get access model detail');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

accessModelRoutes.post('/', async (c) => {
  const data = await c.req.json();
  try {
    const am = await createAccessModel({
      name: data.name,
      displayName: data.displayName || null,
      description: data.description || null,
      enabled: data.enabled ?? true,
      capabilities: data.capabilities ?? null,
    });
    return c.json({ success: true, data: am }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create access model');
    const msg = error instanceof Error ? error.message : 'Unknown error';
    const status = msg.includes('unique') ? 409 : 500;
    return c.json({ success: false, error: msg }, status);
  }
});

accessModelRoutes.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  try {
    const updated = await updateAccessModel(id, {
      name: data.name,
      displayName: data.displayName,
      description: data.description,
      enabled: data.enabled,
      capabilities: data.capabilities,
    });
    if (!updated) return c.json({ success: false, error: 'Access model not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update access model');
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (msg.includes('System access model')) return c.json({ success: false, error: msg }, 403);
    return c.json({ success: false, error: msg }, 500);
  }
});

accessModelRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const deleted = await deleteAccessModel(id);
    if (!deleted) return c.json({ success: false, error: 'Access model not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete access model');
    const msg = error instanceof Error ? error.message : 'Unknown error';
    if (msg.includes('System access model')) return c.json({ success: false, error: msg }, 403);
    return c.json({ success: false, error: msg }, 500);
  }
});

accessModelRoutes.patch('/:id/toggle', async (c) => {
  const id = c.req.param('id');
  try {
    const updated = await toggleAccessModel(id);
    if (!updated) return c.json({ success: false, error: 'Access model not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle access model');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

export default accessModelRoutes;
