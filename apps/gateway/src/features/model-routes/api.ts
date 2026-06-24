import { Hono } from 'hono';

import { rootLogger } from '../../lib';

import {
  listModelRoutes,
  getModelRoute,
  getFlowData,
  createModelRoute,
  updateModelRoute,
  deleteModelRoute,
  toggleModelRoute,
} from './service';

const logger = rootLogger.child({ module: 'model-routes' });

const modelRoutesApi = new Hono();

modelRoutesApi.get('/', async (c) => {
  const accessModelId = c.req.query('accessModelId') ?? c.req.query('virtualModelId');
  try {
    const data = await listModelRoutes(accessModelId);
    return c.json({ success: true, data });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list model routes');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

modelRoutesApi.get('/flow', async (c) => {
  try {
    const { routes, accessModels: ams } = await getFlowData();
    return c.json({ success: true, data: { routes, accessModels: ams, virtualModels: ams } });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get flow data');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

modelRoutesApi.get('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const data = await getModelRoute(id);
    if (!data) return c.json({ success: false, error: 'Route not found' }, 404);
    return c.json({ success: true, data });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

modelRoutesApi.post('/', async (c) => {
  const data = await c.req.json();
  try {
    const route = await createModelRoute({
      name: data.name,
      description: data.description || null,
      accessModelIds: data.accessModelIds ?? data.virtualModelIds ?? [],
      conditions: data.conditions || [],
      action: data.action,
      priority: data.priority ?? 0,
      enabled: data.enabled ?? true,
      flowData: data.flowData || null,
    });
    return c.json({ success: true, data: route }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

modelRoutesApi.put('/:id', async (c) => {
  const id = c.req.param('id');
  const data = await c.req.json();
  try {
    const updated = await updateModelRoute(id, {
      name: data.name,
      description: data.description,
      accessModelIds: data.accessModelIds ?? data.virtualModelIds,
      conditions: data.conditions,
      action: data.action,
      priority: data.priority,
      enabled: data.enabled,
      flowData: data.flowData,
    });
    if (!updated) return c.json({ success: false, error: 'Route not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

modelRoutesApi.delete('/:id', async (c) => {
  const id = c.req.param('id');
  try {
    const deleted = await deleteModelRoute(id);
    if (!deleted) return c.json({ success: false, error: 'Route not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

modelRoutesApi.patch('/:id/toggle', async (c) => {
  const id = c.req.param('id');
  try {
    const updated = await toggleModelRoute(id);
    if (!updated) return c.json({ success: false, error: 'Route not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle model route');
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});

export default modelRoutesApi;
