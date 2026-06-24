import app from './server'

const port = parseInt(process.env.PORT || '3001')

Bun.serve({
  port,
  fetch: app.fetch,
})

console.log(`API server running on http://localhost:${port}`)
