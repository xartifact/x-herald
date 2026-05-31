import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createEngine, createDatabase, loadConfig, seedSystemData } from '@x-llm-gateway/engine'

let engine: Awaited<ReturnType<typeof createEngine>> | null = null
let initialized = false

async function initialize() {
  if (initialized) return
  const config = loadConfig()
  await createDatabase(config.database)
  await seedSystemData()
  initialized = true
}

async function getEngine() {
  if (!engine) {
    await initialize()
    engine = await createEngine({ mountAdminAPI: true, skipConfigValidation: true })
  }
  return engine
}

const app = new Hono()

app.use('*', cors())

// Proxy all /api requests to engine
app.all('/api/*', async (c) => {
  const { app: engineApp } = await getEngine()
  return engineApp.fetch(c.req.raw)
})

// Health check
app.get('/health', (c) => c.json({ status: 'ok' }))

export default app
