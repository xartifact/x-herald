import { Hono } from 'hono'
import { stream, streamSSE } from 'hono/streaming'

import { rootLogger } from '../../lib'
import { logEventBus } from '../../gateway/services/log-event-bus'
import type { LiveStreamEvent } from '../../gateway/services/log-event-bus'

const logger = rootLogger.child({ module: 'logs' })

import {
  cleanupLogs,
  deleteLog,
  getClientModelStats,
  getConversationTrace,
  getKeyStats,
  getLogDetail,
  getLogsPage,
  getOverviewStats,
  getProviderStats,
  getStorageStats,
} from './services/log-query'
import { AnalyzeLogError, buildAnalysisStream } from './services/log-analyzer'
import { getIntentLogsPage, getIntentStats } from './services/intent-log-service'
import type { IntentSource } from '@xartifact/x-herald-db'
import { INTENT_SOURCE_VALUES } from '@xartifact/x-herald-db'
const logsRoutes = new Hono()

logsRoutes.get('/live', (c) => {
  return streamSSE(c, async (s) => {
    for (const snapshot of logEventBus.activeStreams.values()) {
      await s.writeSSE({ data: JSON.stringify(snapshot) })
    }
    const handler = async (payload: LiveStreamEvent) => {
      try {
        await s.writeSSE({ data: JSON.stringify(payload) })
      } catch {
        /* client disconnected */
      }
    }
    logEventBus.on('log', handler)
    await new Promise<void>((resolve) => {
      // 15s heartbeat 防止代理层超时断连
      const heartbeat = setInterval(async () => {
        try {
          await s.writeSSE({ data: '', event: 'ping' })
        } catch {
          clearInterval(heartbeat)
          resolve()
        }
      }, 15000)

      if (c.req.raw.signal.aborted) {
        clearInterval(heartbeat)
        resolve()
        return
      }
      c.req.raw.signal.addEventListener(
        'abort',
        () => {
          clearInterval(heartbeat)
          resolve()
        },
        { once: true },
      )
    })
    logEventBus.off('log', handler)
  })
})

logsRoutes.post('/live/:logId/cancel', async (c) => {
  const logId = c.req.param('logId')
  const existed = logEventBus.abortRequest(logId)
  return existed
    ? c.json({ success: true, message: `已取消请求 ${logId}` })
    : c.json({ success: false, error: '该请求不在活跃状态中' }, 404)
})

logsRoutes.get('/', async (c) => {
  try {
    const q = c.req.query()
    const result = await getLogsPage({
      cursor: q.cursor,
      pageSize: parseInt(q.pageSize || '50'),
      virtualKeyId: q.virtualKeyId,
      modelName: q.modelName,
      status: q.status,
      startDate: q.startDate,
      endDate: q.endDate,
      clientType: q.clientType,
    })
    return c.json({
      success: true,
      data: result.logs,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list logs')
    return c.json({ error: 'Failed to list logs', code: 'LOGS_LIST_ERROR' }, 500)
  }
})

logsRoutes.get('/client-models', async (c) => {
  try {
    const q = c.req.query()
    const data = await getClientModelStats({ startDate: q.startDate, endDate: q.endDate })
    return c.json({ success: true, data })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get client model stats')
    return c.json(
      { error: 'Failed to get client model stats', code: 'CLIENT_MODEL_STATS_ERROR' },
      500,
    )
  }
})

logsRoutes.get('/conversation/:conversationId', async (c) => {
  try {
    const data = await getConversationTrace(c.req.param('conversationId'))
    return c.json({ success: true, data })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get conversation trace')
    return c.json(
      { error: 'Failed to get conversation trace', code: 'CONVERSATION_TRACE_ERROR' },
      500,
    )
  }
})

logsRoutes.get('/intents', async (c) => {
  try {
    const q = c.req.query()
    const intentSource = q.intentSource as IntentSource | undefined
    const validatedSource =
      intentSource && (INTENT_SOURCE_VALUES as readonly string[]).includes(intentSource)
        ? intentSource
        : undefined
    const result = await getIntentLogsPage({
      cursor: q.cursor,
      pageSize: parseInt(q.pageSize || '50'),
      virtualKeyId: q.virtualKeyId,
      accessModelId: q.accessModelId,
      intentName: q.intentName,
      intentSource: validatedSource,
      startDate: q.startDate,
      endDate: q.endDate,
    })
    return c.json({
      success: true,
      data: result.logs,
      nextCursor: result.nextCursor,
      hasMore: result.hasMore,
    })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to list intent logs')
    return c.json({ error: 'Failed to list intent logs', code: 'INTENT_LOGS_LIST_ERROR' }, 500)
  }
})

logsRoutes.get('/intents/stats', async (c) => {
  try {
    const q = c.req.query()
    const data = await getIntentStats({
      startDate: q.startDate,
      endDate: q.endDate,
      virtualKeyId: q.virtualKeyId,
    })
    return c.json({ success: true, data })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get intent stats')
    return c.json({ error: 'Failed to get intent stats', code: 'INTENT_STATS_ERROR' }, 500)
  }
})

logsRoutes.get('/:id', async (c) => {
  try {
    const log = await getLogDetail(c.req.param('id'))
    if (!log) return c.json({ error: 'Log not found', code: 'LOG_NOT_FOUND' }, 404)
    return c.json({ success: true, data: log })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get log')
    return c.json({ error: 'Failed to get log', code: 'LOG_GET_ERROR' }, 500)
  }
})

logsRoutes.delete('/:id', async (c) => {
  try {
    const deleted = await deleteLog(c.req.param('id'))
    if (!deleted) return c.json({ error: 'Log not found', code: 'LOG_NOT_FOUND' }, 404)
    logger.info({ logId: c.req.param('id') }, 'Log deleted')
    return c.json({ success: true, message: 'Log deleted successfully' })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to delete log')
    return c.json({ error: 'Failed to delete log', code: 'LOG_DELETE_ERROR' }, 500)
  }
})

logsRoutes.get('/stats/overview', async (c) => {
  try {
    const q = c.req.query()
    const data = await getOverviewStats({ startDate: q.startDate, endDate: q.endDate })
    return c.json({ success: true, data })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get log stats')
    return c.json({ error: 'Failed to get log stats', code: 'LOG_STATS_ERROR' }, 500)
  }
})

logsRoutes.get('/stats/storage', async (c) => {
  try {
    return c.json({ success: true, data: await getStorageStats() })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get storage stats')
    return c.json({ error: 'Failed to get storage stats', code: 'STORAGE_STATS_ERROR' }, 500)
  }
})

logsRoutes.post('/cleanup', async (c) => {
  try {
    const body = await c.req.json()
    const data = await cleanupLogs(body.retentionDays || 30)
    logger.info(data, 'Logs cleaned up')
    return c.json({ success: true, data, message: `Deleted ${data.deletedCount} expired logs` })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to cleanup logs')
    return c.json({ error: 'Failed to cleanup logs', code: 'LOG_CLEANUP_ERROR' }, 500)
  }
})

logsRoutes.get('/stats/keys', async (c) => {
  try {
    const data = await getKeyStats(c.req.query('period') ?? 'all')
    return c.json({ success: true, data })
  } catch (error) {
    logger.error({ error }, 'Failed to fetch key stats')
    return c.json({ success: false, error: 'Failed to fetch key stats' }, 500)
  }
})

logsRoutes.get('/stats/providers', async (c) => {
  try {
    const q = c.req.query()
    const data = await getProviderStats({ startDate: q.startDate, endDate: q.endDate })
    return c.json({ success: true, data })
  } catch (error) {
    logger.warn({ err: error }, 'Failed to get provider stats')
    return c.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    )
  }
})

logsRoutes.post('/:id/analyze', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { indices?: number[]; mode?: string }
  try {
    const analysisStream = await buildAnalysisStream(c.req.param('id'), {
      indices: body.indices,
      mode: body.mode as 'full' | 'system' | 'user' | undefined,
    })
    return stream(c, async (s) => {
      try {
        const reader = analysisStream.getReader()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          await s.write(value)
        }
      } catch (err) {
        logger.warn({ err }, 'Failed to stream analysis')
        await s.write(
          new TextEncoder().encode(`data: {"error":"Analysis request failed"}\n\ndata: [DONE]\n\n`),
        )
      }
    })
  } catch (err) {
    if (err instanceof AnalyzeLogError) return c.json({ error: err.message }, err.statusCode)
    throw err
  }
})

export default logsRoutes
