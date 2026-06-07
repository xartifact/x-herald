import { Hono } from 'hono'

import { rootLogger } from '../lib'
import { CAManager } from './ca-manager'
import { TLSInterceptor } from './tls-interceptor'

const logger = rootLogger.child({ module: 'mitm-routes' })

const MITM_DATA_DIR = process.env.MITM_DATA_DIR || join(process.cwd(), 'data', 'mitm')

import { join } from 'path'

// Singleton instances
let caManager: CAManager | null = null
let interceptor: TLSInterceptor | null = null

async function getCAManager(): Promise<CAManager> {
  if (!caManager) {
    caManager = new CAManager(MITM_DATA_DIR)
    await caManager.init()
  }
  return caManager
}

async function getInterceptor(): Promise<TLSInterceptor> {
  if (!interceptor) {
    const ca = await getCAManager()
    interceptor = new TLSInterceptor(ca)
  }
  return interceptor
}

const mitmRoutes = new Hono()

// GET /api/mitm/ca-cert - Download CA certificate
mitmRoutes.get('/ca-cert', async (c) => {
  try {
    const ca = await getCAManager()
    const cert = ca.getCACert()
    return c.body(cert, 200, {
      'Content-Type': 'application/x-x509-ca-cert',
      'Content-Disposition': 'attachment; filename="x-llm-gateway-ca.crt"',
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get CA certificate')
    return c.json({ error: 'CA certificate not available' }, 500)
  }
})

// GET /api/mitm/ca-fingerprint - Get CA fingerprint for verification
mitmRoutes.get('/ca-fingerprint', async (c) => {
  try {
    const ca = await getCAManager()
    return c.json({
      fingerprint: ca.getCAFingerprint(),
      algorithm: 'SHA-256',
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get CA fingerprint')
    return c.json({ error: 'CA fingerprint not available' }, 500)
  }
})

// GET /api/mitm/status - MITM proxy status
mitmRoutes.get('/status', async (c) => {
  try {
    const mitm = await getInterceptor()
    return c.json({
      running: mitm.isRunning(),
      port: mitm.getPort(),
      activeConnections: mitm.getActiveConnections(),
      interceptedDomains: mitm.getInterceptedDomains(),
    })
  } catch (error) {
    logger.error({ error }, 'Failed to get MITM status')
    return c.json({ error: 'Failed to get status' }, 500)
  }
})

// POST /api/mitm/start - Start MITM proxy
mitmRoutes.post('/start', async (c) => {
  try {
    const body = await c.req.json<{ port?: number }>()
    const port = body.port || 8443
    const mitm = await getInterceptor()
    await mitm.start(port)
    return c.json({
      message: 'MITM proxy started',
      port,
      running: true,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to start MITM proxy')
    return c.json(
      {
        error: 'Failed to start MITM proxy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
})

// POST /api/mitm/stop - Stop MITM proxy
mitmRoutes.post('/stop', async (c) => {
  try {
    const mitm = await getInterceptor()
    await mitm.stop()
    return c.json({
      message: 'MITM proxy stopped',
      running: false,
    })
  } catch (error) {
    logger.error({ error }, 'Failed to stop MITM proxy')
    return c.json(
      {
        error: 'Failed to stop MITM proxy',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      500
    )
  }
})

// DELETE /api/mitm/cache - Clear certificate cache
mitmRoutes.delete('/cache', async (c) => {
  try {
    const ca = await getCAManager()
    ca.clearCache()
    return c.json({ message: 'Certificate cache cleared' })
  } catch (error) {
    logger.error({ error }, 'Failed to clear certificate cache')
    return c.json({ error: 'Failed to clear cache' }, 500)
  }
})

export default mitmRoutes
export { getCAManager, getInterceptor }
