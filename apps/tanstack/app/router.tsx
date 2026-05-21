import { createRouter as createTanStackRouter, createRoute } from '@tanstack/react-router'
import { RootRoute } from './routes/__root'

const rootRoute = RootRoute

const routeTree = rootRoute.addChildren([])

export function createRouter() {
  return createTanStackRouter({ routeTree, defaultPreload: 'intent' })
}

declare module '@tanstack/react-router' {
  interface Register { router: ReturnType<typeof createRouter> }
}
