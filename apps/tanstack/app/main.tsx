import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter, createRoute } from '@tanstack/react-router'
import { Route as RootRoute } from './routes/__root'
import { Route as LoginRoute } from './routes/login'
import { Route as AdminRoute } from './routes/admin'
import { Route as DashboardRoute } from './routes/admin/index'
import './styles/app.css'

const rootRoute = RootRoute

const loginRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/login', component: LoginRoute.component,
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/admin', component: AdminRoute.component,
})

const dashboardRoute = createRoute({
  getParentRoute: () => adminRoute, path: '/', component: DashboardRoute.component,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute, path: '/',
  component: () => { React.useEffect(() => { window.location.href = '/login' }, []); return null },
})

const routeTree = rootRoute.addChildren([loginRoute, indexRoute, adminRoute])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>
)
