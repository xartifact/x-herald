import { Hono } from 'hono'

import { rootLogger } from '../../lib'
import {
  listPotentialModelsQuerySchema,
  updatePotentialModelSchema,
  convertToAccessModelSchema,
} from '@xartifact/x-herald-shared'

import {
  countPotentialModels,
  listPotentialModels,
  getPotentialModel,
  updatePotentialModel,
  deletePotentialModel,
  convertToAccessModel,
} from './service'

const logger = rootLogger.child({ module: 'potential-models-api' })

const potentialModelRoutes = new Hono()

potentialModelRoutes.get('/', async (c) => {
  const parsed = listPotentialModelsQuerySchema.safeParse({
    action: c.req.query('action'),
    enabled: c.req.query('enabled'),
    minCount: c.req.query('minCount'),
    page: c.req.query('page'),
    pageSize: c.req.query('pageSize'),
  })
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid query', details: parsed.error.flatten() }, 400)
  }
  try {
    const { page, pageSize, action, enabled, minCount } = parsed.data
    const limit = pageSize
    const offset = (page - 1) * pageSize
    const filter = { action, enabled, minCount }
    const [data, total] = await Promise.all([
      listPotentialModels({ ...filter, limit, offset }),
      countPotentialModels(filter),
    ])
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    return c.json({
      success: true,
      data,
      pagination: { page, pageSize, total, totalPages },
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list potential models')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

potentialModelRoutes.get('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const result = await getPotentialModel(id)
    if (!result) return c.json({ success: false, error: 'Potential model not found' }, 404)
    return c.json({ success: true, data: result })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get potential model')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

potentialModelRoutes.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const parsed = updatePotentialModelSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid body', details: parsed.error.flatten() }, 400)
  }
  try {
    const updated = await updatePotentialModel(id, parsed.data)
    if (!updated) return c.json({ success: false, error: 'Potential model not found' }, 404)
    return c.json({ success: true, data: updated })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to update potential model')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

potentialModelRoutes.delete('/:id', async (c) => {
  const id = c.req.param('id')
  try {
    const deleted = await deletePotentialModel(id)
    if (!deleted) return c.json({ success: false, error: 'Potential model not found' }, 404)
    return c.json({ success: true })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete potential model')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

potentialModelRoutes.post('/:id/convert', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json().catch(() => ({}))
  const parsed = convertToAccessModelSchema.safeParse(body)
  if (!parsed.success) {
    return c.json({ success: false, error: 'Invalid body', details: parsed.error.flatten() }, 400)
  }
  try {
    const result = await convertToAccessModel(id, parsed.data)
    return c.json({ success: true, data: result }, 201)
  } catch (error) {
    logger.warn({ err: error }, 'Failed to convert potential model')
    const msg = error instanceof Error ? error.message : 'Unknown error'
    const status = msg.includes('not found') ? 404 : msg.includes('unique') ? 409 : 500
    return c.json({ success: false, error: msg }, status)
  }
})

export default potentialModelRoutes
