import app from './server'

const port = parseInt(process.env.PORT || '3001')
console.log(`API server running on http://localhost:${port}`)

export default {
  port,
  fetch: app.fetch,
}
