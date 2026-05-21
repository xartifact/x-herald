import { Hono } from 'hono';

import { rootLogger } from '@x-llm-gateway/engine';
import { authMiddleware } from '@/features/auth/middleware';
import { modelGroupRouter } from '@/features/gateway/services/model-group-router';

import {
  assignInstance,
  createGroup,
  createInstance,
  deleteGroup,
  deleteInstance,
  listGroups,
  listInstances,
  reorderInstances,
  setInstanceGroupsById,
  toggleGroup,
  toggleInstance,
  updateGroup,
  updateInstance,
} from './service';

const logger = rootLogger.child({ module: 'model-groups' });

const modelGroupRoutes = new Hono();

modelGroupRoutes.use('*', authMiddleware);

modelGroupRoutes.get('/', async (c) => {
  const data = await listGroups();
  return c.json({ success: true, data });
});

modelGroupRoutes.get('/instances', async (c) => {
  try {
    return c.json({ success: true, data: await listInstances() });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list model instances');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.get('/:id', async (c) => {
  const detail = await modelGroupRouter.getModelGroupDetail(c.req.param('id'));
  if (!detail) return c.json({ success: false, error: 'Model group not found' }, 404);
  return c.json({ success: true, data: detail });
});

modelGroupRoutes.post('/', async (c) => {
  try {
    const data = await c.req.json();
    return c.json({ success: true, data: await createGroup(data) }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create model group');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.put('/:id', async (c) => {
  try {
    const updated = await updateGroup(c.req.param('id'), await c.req.json());
    if (!updated) return c.json({ success: false, error: 'Model group not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update model group');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.delete('/:id', async (c) => {
  try {
    const deleted = await deleteGroup(c.req.param('id'));
    if (!deleted) return c.json({ success: false, error: 'Model group not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete model group');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.patch('/:id/toggle', async (c) => {
  try {
    const updated = await toggleGroup(c.req.param('id'));
    if (!updated) return c.json({ success: false, error: 'Model group not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle model group');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.put('/instances/reorder', async (c) => {
  try {
    const { instanceIds } = await c.req.json<{ instanceIds: string[] }>();
    await reorderInstances(instanceIds);
    return c.json({ success: true });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to reorder model instances');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.post('/instances', async (c) => {
  try {
    const result = await createInstance(await c.req.json());
    if ('error' in result) return c.json({ success: false, error: result.error }, 404);
    return c.json({ success: true, data: result.data }, 201);
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create model instance');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.put('/instances/:id', async (c) => {
  try {
    const updated = await updateInstance(c.req.param('id'), await c.req.json());
    if (!updated) return c.json({ success: false, error: 'Model instance not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update model instance');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.put('/instances/:id/groups', async (c) => {
  try {
    const { groupIds } = await c.req.json<{ groupIds: string[] }>();
    const result = await setInstanceGroupsById(c.req.param('id'), groupIds);
    if (!result) return c.json({ success: false, error: 'Model instance not found' }, 404);
    if ('error' in result) return c.json({ success: false, error: result.error }, 404);
    return c.json({ success: true, data: result.data });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to set instance groups');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.delete('/instances/:id', async (c) => {
  try {
    const deleted = await deleteInstance(c.req.param('id'));
    if (!deleted) return c.json({ success: false, error: 'Model instance not found' }, 404);
    return c.json({ success: true, data: deleted });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete model instance');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.patch('/instances/:id/assign', async (c) => {
  try {
    const { groupId } = await c.req.json<{ groupId: string | null }>();
    const result = await assignInstance(c.req.param('id'), groupId);
    if ('error' in result) return c.json({ success: false, error: result.error }, 404);
    return c.json({ success: true, data: result.data });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to assign model instance');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

modelGroupRoutes.patch('/instances/:id/toggle', async (c) => {
  try {
    const updated = await toggleInstance(c.req.param('id'));
    if (!updated) return c.json({ success: false, error: 'Model instance not found' }, 404);
    return c.json({ success: true, data: updated });
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle model instance');
    return c.json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, 500);
  }
});

export default modelGroupRoutes;
