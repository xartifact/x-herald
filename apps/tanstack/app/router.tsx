import { createRouter, createRootRoute, createRoute } from '@tanstack/react-router'
import { RootRoute } from './routes/__root'
import { Route as LoginRoute } from './routes/login'

const rootRoute = RootRoute

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginRoute.component,
})

const routeTree = rootRoute.addChildren([loginRoute])

export function createRouter() {
  return createRouter({
    routeTree,
    defaultPreload: 'intent',
  })
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof createRouter>
  }
}
