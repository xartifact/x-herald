import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider, createRouter, createRoute, createRootRoute } from '@tanstack/react-router'
import { RootLayout } from './routes/__root'
import { LoginPage } from './routes/login'
import { AdminLayout } from './routes/admin'

// Admin sub-pages
import { DashboardPage } from './routes/admin/index'
import { ProvidersPage } from './routes/admin/providers/index'
import { KeysPage } from './routes/admin/keys/index'
import { ModelGroupsPage } from './routes/admin/model-groups/index'
import { SettingsPage } from './routes/admin/settings/index'
import { AccessModelsPage } from './routes/admin/access-models/index'
import { CircuitBreakerPage } from './routes/admin/circuit-breaker/index'
import { LogsPage } from './routes/admin/logs/index'
import { LogDetailPage } from './routes/admin/logs/log-detail'
import { MetricsPage } from './routes/admin/metrics/index'
import { ClientModelsPage } from './routes/admin/client-models/index'
import { CostsPage } from './routes/admin/costs/index'
import { ProviderStatsPage } from './routes/admin/provider-stats/index'
import { ModelRoutesPage } from './routes/admin/model-routes/index'
import { MitmPage } from './routes/admin/mitm/index'

import './styles/app.css'

const rootRoute = createRootRoute({ component: RootLayout })

const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage })
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => { React.useEffect(() => { window.location.href = '/login' }, []); return null },
})

const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: AdminLayout })
const dashboardRoute = createRoute({ getParentRoute: () => adminRoute, path: '/dashboard', component: DashboardPage })
const indexRoute2 = createRoute({ getParentRoute: () => adminRoute, path: '/', component: DashboardPage })
const providersRoute = createRoute({ getParentRoute: () => adminRoute, path: '/providers', component: ProvidersPage })
const keysRoute = createRoute({ getParentRoute: () => adminRoute, path: '/keys', component: KeysPage })
const modelGroupsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/model-groups', component: ModelGroupsPage })
const settingsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/settings', component: SettingsPage })
const accessModelsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/access-models', component: AccessModelsPage })
const circuitBreakerRoute = createRoute({ getParentRoute: () => adminRoute, path: '/circuit-breaker', component: CircuitBreakerPage })
const logsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/logs', component: LogsPage })
const logDetailRoute = createRoute({ getParentRoute: () => adminRoute, path: '/logs/$logId', component: LogDetailPage })
const metricsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/metrics', component: MetricsPage })
const clientModelsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/client-models', component: ClientModelsPage })
const costsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/costs', component: CostsPage })
const providerStatsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/provider-stats', component: ProviderStatsPage })
const modelRoutesRoute = createRoute({ getParentRoute: () => adminRoute, path: '/model-routes', component: ModelRoutesPage })
const mitmRoute = createRoute({ getParentRoute: () => adminRoute, path: '/mitm', component: MitmPage })

const routeTree = rootRoute.addChildren([
  loginRoute,
  indexRoute,
  adminRoute.addChildren([
    dashboardRoute, indexRoute2, providersRoute, keysRoute, modelGroupsRoute,
    settingsRoute, accessModelsRoute, circuitBreakerRoute,
    logsRoute, logDetailRoute, metricsRoute, clientModelsRoute, costsRoute, providerStatsRoute,
    modelRoutesRoute, mitmRoute,
  ]),
])
const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode><RouterProvider router={router} /></React.StrictMode>
)
