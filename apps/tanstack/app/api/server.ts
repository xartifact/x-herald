import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createEngine } from '@x-llm-gateway/engine'

let engine: Awaited<ReturnType<typeof createEngine>> | null = null

async function getEngine() {
  if (!engine) {
    engine = await createEngine({ skipConfigValidation: true })
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
