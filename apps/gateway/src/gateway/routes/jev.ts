import { Hono } from 'hono'

import type { VirtualKey } from '@xartifact/x-herald-db'

import { handleJevSystemOne } from '../handlers/jev/system-one-handler'

const jevRoutes = new Hono<{
  Variables: {
    virtualKey: VirtualKey
  }
}>()

/** JEV System One compatible endpoint. */
jevRoutes.post('/systemone', async (c) => {
  const body = await c.req.json().catch(() => ({}))
  return handleJevSystemOne(c, body)
})

export default jevRoutes
