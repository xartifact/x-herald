import { Hono } from 'hono'

import { costService } from './service'

const costRoutes = new Hono()

// GET /api/costs/summary - Cost summary with filters
costRoutes.get('/summary', async (c) => {
  try {
    const { startDate, endDate, keyId, providerName, modelName } = c.req.query()
    const summary = await costService.getCostSummary({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      keyId,
      providerName,
      modelName,
    })
    return c.json({ success: true, data: summary })
  } catch {
    return c.json({ error: 'Failed to get cost summary', code: 'COST_SUMMARY_ERROR' }, 500)
  }
})

// GET /api/costs/by-key - Cost breakdown by virtual key
costRoutes.get('/by-key', async (c) => {
  try {
    const { startDate, endDate } = c.req.query()
    const data = await costService.getCostByDimension({
      dimension: 'key',
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    })
    return c.json({ success: true, data })
  } catch {
    return c.json({ error: 'Failed to get cost by key', code: 'COST_BY_KEY_ERROR' }, 500)
  }
})

// GET /api/costs/by-provider - Cost breakdown by provider
costRoutes.get('/by-provider', async (c) => {
  try {
    const { startDate, endDate } = c.req.query()
    const data = await costService.getCostByDimension({
      dimension: 'provider',
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    })
    return c.json({ success: true, data })
  } catch {
    return c.json({ error: 'Failed to get cost by provider', code: 'COST_BY_PROVIDER_ERROR' }, 500)
  }
})

// GET /api/costs/by-model - Cost breakdown by model
costRoutes.get('/by-model', async (c) => {
  try {
    const { startDate, endDate } = c.req.query()
    const data = await costService.getCostByDimension({
      dimension: 'model',
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    })
    return c.json({ success: true, data })
  } catch {
    return c.json({ error: 'Failed to get cost by model', code: 'COST_BY_MODEL_ERROR' }, 500)
  }
})

// PUT /api/costs/pricing - Update provider pricing
costRoutes.put('/pricing', async (c) => {
  try {
    const { provider, inputPer1k, outputPer1k } = await c.req.json()
    if (!provider || typeof inputPer1k !== 'number' || typeof outputPer1k !== 'number') {
      return c.json({ error: 'Invalid pricing parameters', code: 'INVALID_PRICING_PARAMS' }, 400)
    }
    costService.setPricing(provider, { inputPer1k, outputPer1k })
    return c.json({ success: true, message: 'Pricing updated' })
  } catch {
    return c.json({ error: 'Failed to update pricing', code: 'PRICING_UPDATE_ERROR' }, 500)
  }
})

// GET /api/costs/pricing - Get all pricing
costRoutes.get('/pricing', async (c) => {
  try {
    const pricing: Record<string, { inputPer1k: number; outputPer1k: number }> = {}
    for (const [provider, config] of costService.getAllPricing()) {
      pricing[provider] = config
    }
    return c.json({ success: true, data: pricing })
  } catch {
    return c.json({ error: 'Failed to get pricing', code: 'PRICING_GET_ERROR' }, 500)
  }
})

export default costRoutes
