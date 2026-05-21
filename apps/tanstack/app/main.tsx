import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter, createRoute } from '@tanstack/react-router'
import { Route as RootRoute } from './routes/__root'
import { Route as LoginRoute } from './routes/login'
import { Route as AdminRoute } from './routes/admin'

// Admin sub-pages
import { Route as DashboardRoute } from './routes/admin/index'
import { Route as ProvidersRoute } from './routes/admin/providers/index'
import { Route as KeysRoute } from './routes/admin/keys/index'
import { Route as ModelGroupsRoute } from './routes/admin/model-groups/index'
import { Route as SettingsRoute } from './routes/admin/settings/index'
import { Route as AccessModelsRoute } from './routes/admin/access-models/index'
import { Route as CircuitBreakerRoute } from './routes/admin/circuit-breaker/index'
import { Route as LogsRoute } from './routes/admin/logs/index'
import { Route as MetricsRoute } from './routes/admin/metrics/index'
import { Route as ClientModelsRoute } from './routes/admin/client-models/index'
import { Route as ProviderStatsRoute } from './routes/admin/provider-stats/index'

import './styles/app.css'

const rootRoute = RootRoute

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginRoute.component })
const indexRoute = createRoute({ getParentRoute: () => rootRoute, path: '/',
  component: () => { React.useEffect(() => { window.location.href = '/login' }, []); return null } })

const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: AdminRoute.component })
const dashboardRoute = createRoute({ getParentRoute: () => adminRoute, path: '/', component: DashboardRoute.component })
const providersRoute = createRoute({ getParentRoute: () => adminRoute, path: '/providers', component: ProvidersRoute.component })
const keysRoute = createRoute({ getParentRoute: () => adminRoute, path: '/keys', component: KeysRoute.component })
const modelGroupsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/model-groups', component: ModelGroupsRoute.component })
const settingsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/settings', component: SettingsRoute.component })
const accessModelsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/access-models', component: AccessModelsRoute.component })
const circuitBreakerRoute = createRoute({ getParentRoute: () => adminRoute, path: '/circuit-breaker', component: CircuitBreakerRoute.component })
const logsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/logs', component: LogsRoute.component })
const metricsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/metrics', component: MetricsRoute.component })
const clientModelsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/client-models', component: ClientModelsRoute.component })
const providerStatsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/provider-stats', component: ProviderStatsRoute.component })

adminRoute.addChildren([
  dashboardRoute, providersRoute, keysRoute, modelGroupsRoute,
  settingsRoute, accessModelsRoute, circuitBreakerRoute,
  logsRoute, metricsRoute, clientModelsRoute, providerStatsRoute,
])

const routeTree = rootRoute.addChildren([loginRoute, indexRoute, adminRoute])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>
)
