import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter, createRoute } from '@tanstack/react-router'
import { Route as RootRoute } from './routes/__root'
import { Route as LoginRoute } from './routes/login'
import { Route as AdminRoute } from './routes/admin'
import { Route as DashboardRoute } from './routes/admin/index'
import { Route as ProvidersRoute } from './routes/admin/providers/index'
import { Route as KeysRoute } from './routes/admin/keys/index'
import { Route as ModelGroupsRoute } from './routes/admin/model-groups/index'
import './styles/app.css'

const rootRoute = RootRoute

function r(path: string, parent: any, Component: any) {
  return createRoute({ getParentRoute: () => parent, path, component: Component })
}

const loginRoute = r('/login', rootRoute, LoginRoute.component)
const indexRoute = r('/', rootRoute, () => {
  React.useEffect(() => { window.location.href = '/login' }, []); return null
})

const adminRoute = r('/admin', rootRoute, AdminRoute.component)
const dashboardRoute = r('/', adminRoute, DashboardRoute.component)
const providersRoute = r('/providers', adminRoute, ProvidersRoute.component)
const keysRoute = r('/keys', adminRoute, KeysRoute.component)
const modelGroupsRoute = r('/model-groups', adminRoute, ModelGroupsRoute.component)

adminRoute.addChildren([dashboardRoute, providersRoute, keysRoute, modelGroupsRoute])

const routeTree = rootRoute.addChildren([loginRoute, indexRoute, adminRoute])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>
)
