import { Hono } from 'hono'

import { rootLogger } from '../../lib'

import { exportConfig, importConfig, EXPORT_VERSION } from '.'

const logger = rootLogger.child({ module: 'config-io' })

const configIORoutes = new Hono()

/**
 * 导出配置数据
 */
configIORoutes.get('/export', async (c) => {
  try {
    const data = await exportConfig()
    const date = new Date().toISOString().slice(0, 10)
    const filename = `x-llm-gateway-config-${date}.json`

    logger.info('Config exported successfully')

    return c.body(JSON.stringify(data, null, 2), 200, {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="${filename}"`,
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to export config')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

/**
 * 导入配置数据
 */
configIORoutes.post('/import', async (c) => {
  try {
    const body = await c.req.json()

    if (!body || typeof body !== 'object') {
      return c.json({ success: false, error: 'Invalid JSON body' }, 400)
    }

    if (body.version !== EXPORT_VERSION) {
      return c.json(
        {
          success: false,
          error: `Unsupported export version: ${body.version}. Expected: ${EXPORT_VERSION}`,
        },
        400,
      )
    }

    if (!body.data || typeof body.data !== 'object') {
      return c.json({ success: false, error: 'Missing data field' }, 400)
    }

    const result = await importConfig(body.data)

    logger.info({ summary: result.summary }, 'Config imported')

    return c.json(result)
  } catch (error) {
    logger.warn({ err: error }, 'Failed to import config')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

export default configIORoutes
