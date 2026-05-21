import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/start/server'
import { getRouterManifest } from '@tanstack/start/router-manifest'
import { createRouter } from './router'

const handler = createStartHandler({
  createRouter,
  getRouterManifest,
})

export default handler(defaultStreamHandler)
