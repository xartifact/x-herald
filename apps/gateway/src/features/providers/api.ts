import { Hono } from 'hono'

import { rootLogger } from '../../lib'

import {
  CreateProviderSchema,
  SyncModelsSchema,
  UpdateProviderSchema,
  createProvider,
  deleteProvider,
  fetchRemoteModels,
  getProvider,
  getThinkingMappings,
  listProviders,
  syncModels,
  toggleProvider,
  updateProvider,
  updateThinkingMappings,
} from './service'

const logger = rootLogger.child({ module: 'providers' })

const providersRoutes = new Hono()

providersRoutes.get('/', async (c) => {
  try {
    const data = await listProviders()
    return c.json({ success: true, data, total: data.length })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list providers')
    return c.json({ error: 'Failed to list providers', code: 'PROVIDERS_LIST_ERROR' }, 500)
  }
})

providersRoutes.get('/:id', async (c) => {
  try {
    const provider = await getProvider(c.req.param('id'))
    if (!provider) return c.json({ error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, 404)
    return c.json({ success: true, data: provider })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get provider')
    return c.json({ error: 'Failed to get provider', code: 'PROVIDER_GET_ERROR' }, 500)
  }
})

providersRoutes.post('/', async (c) => {
  try {
    const parsed = CreateProviderSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: parsed.error.issues[0].message, code: 'VALIDATION_ERROR' }, 400)
    const data = await createProvider(parsed.data)
    return c.json({ success: true, data }, 201)
  } catch (error) {
    logger.warn({ err: error }, 'Failed to create provider')
    return c.json({ error: 'Failed to create provider', code: 'PROVIDER_CREATE_ERROR' }, 500)
  }
})

providersRoutes.put('/:id', async (c) => {
  try {
    const parsed = UpdateProviderSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: parsed.error.issues[0].message, code: 'VALIDATION_ERROR' }, 400)
    const data = await updateProvider(c.req.param('id'), parsed.data)
    if (!data) return c.json({ error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, 404)
    return c.json({ success: true, data })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update provider')
    return c.json({ error: 'Failed to update provider', code: 'PROVIDER_UPDATE_ERROR' }, 500)
  }
})

providersRoutes.delete('/:id', async (c) => {
  try {
    const deleted = await deleteProvider(c.req.param('id'))
    if (!deleted) return c.json({ error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, 404)
    return c.json({ success: true, message: 'Provider deleted successfully' })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete provider')
    return c.json({ error: 'Failed to delete provider', code: 'PROVIDER_DELETE_ERROR' }, 500)
  }
})

providersRoutes.patch('/:id/toggle', async (c) => {
  try {
    const updated = await toggleProvider(c.req.param('id'))
    if (!updated) return c.json({ error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, 404)
    return c.json({ success: true, data: updated })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to toggle provider')
    return c.json({ error: 'Failed to toggle provider', code: 'PROVIDER_TOGGLE_ERROR' }, 500)
  }
})

providersRoutes.get('/:id/thinking-type-mappings', async (c) => {
  try {
    const result = await getThinkingMappings(c.req.param('id'))
    if (!result) return c.json({ error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, 404)
    return c.json({
      success: true,
      data: result.mappings,
      syntheticThinking: result.syntheticThinking,
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get thinking type mappings')
    return c.json(
      { error: 'Failed to get thinking type mappings', code: 'MAPPINGS_GET_ERROR' },
      500,
    )
  }
})

providersRoutes.put('/:id/thinking-type-mappings', async (c) => {
  try {
    const body = await c.req.json()
    const result = await updateThinkingMappings(c.req.param('id'), body)
    if (!result) return c.json({ error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, 404)
    return c.json({
      success: true,
      message: 'Thinking type mappings updated successfully',
      data: result,
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update thinking type mappings')
    return c.json(
      { error: 'Failed to update thinking type mappings', code: 'MAPPINGS_UPDATE_ERROR' },
      500,
    )
  }
})

providersRoutes.get('/:id/models', async (c) => {
  try {
    const result = await fetchRemoteModels(c.req.param('id'))
    if (!result.ok) {
      if (result.code === 'NOT_FOUND')
        return c.json({ error: 'Provider not found', code: 'PROVIDER_NOT_FOUND' }, 404)
      return c.json({ error: 'Provider is disabled', code: 'PROVIDER_DISABLED' }, 400)
    }
    return c.json({
      success: true,
      data: result.models,
      total: result.models.length,
      fetchError: result.fetchError,
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get provider models')
    return c.json({ error: 'Failed to get provider models', code: 'PROVIDER_MODELS_ERROR' }, 500)
  }
})

providersRoutes.post('/:id/sync-models', async (c) => {
  try {
    const parsed = SyncModelsSchema.safeParse(await c.req.json())
    if (!parsed.success)
      return c.json({ error: parsed.error.issues[0].message, code: 'VALIDATION_ERROR' }, 400)
    const result = await syncModels(c.req.param('id'), parsed.data)
    if (!result.ok) {
      const codes = {
        NOT_FOUND: 'PROVIDER_NOT_FOUND',
        DISABLED: 'PROVIDER_DISABLED',
        GROUP_NOT_FOUND: 'MODEL_GROUP_NOT_FOUND',
      } as const
      return c.json(
        { error: result.code, code: codes[result.code] },
        result.code === 'NOT_FOUND' ? 404 : 400,
      )
    }
    return c.json({ success: true, data: result })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to sync models')
    return c.json({ error: 'Failed to sync models', code: 'SYNC_MODELS_ERROR' }, 500)
  }
})

export default providersRoutes
