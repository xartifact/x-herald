import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  RouterProvider,
  createRouter,
  createRoute,
  createRootRoute,
  lazyRouteComponent,
} from '@tanstack/react-router'
import { RootLayout } from './routes/__root'
import { LoginPage } from './routes/login'
import { AdminLayout } from './routes/admin'
const DashboardPage = lazyRouteComponent(() => import('./routes/admin/index'), 'DashboardPage')
const ProvidersPage = lazyRouteComponent(
  () => import('./routes/admin/providers/index'),
  'ProvidersPage',
)
const KeysPage = lazyRouteComponent(() => import('./routes/admin/keys/index'), 'KeysPage')
const ModelGroupsPage = lazyRouteComponent(
  () => import('./routes/admin/model-groups/index'),
  'ModelGroupsPage',
)
const SettingsPage = lazyRouteComponent(
  () => import('./routes/admin/settings/index'),
  'SettingsPage',
)
const AccessModelsPage = lazyRouteComponent(
  () => import('./routes/admin/access-models/index'),
  'AccessModelsPage',
)
const AccessModelDetailPage = lazyRouteComponent(
  () => import('./routes/admin/access-models/detail'),
  'AccessModelDetailPage',
)
const PotentialModelsPage = lazyRouteComponent(
  () => import('./routes/admin/potential-models/index'),
  'PotentialModelsPage',
)
const CircuitBreakerPage = lazyRouteComponent(
  () => import('./routes/admin/circuit-breaker/index'),
  'CircuitBreakerPage',
)
const LogsPage = lazyRouteComponent(() => import('./routes/admin/logs/index'), 'LogsPage')
const LogDetailPage = lazyRouteComponent(
  () => import('./routes/admin/logs/log-detail'),
  'LogDetailPage',
)
const RoutingTracesPage = lazyRouteComponent(
  () => import('./routes/admin/routing-traces/index'),
  'RoutingTracesPage',
)
const RoutingTraceDetailPage = lazyRouteComponent(
  () => import('./routes/admin/routing-traces/log-detail'),
  'RoutingTraceDetailPage',
)
const ConsoleLogsPage = lazyRouteComponent(
  () => import('./routes/admin/console-logs/index'),
  'ConsoleLogsPage',
)
const MetricsPage = lazyRouteComponent(() => import('./routes/admin/metrics/index'), 'MetricsPage')
const ClientModelsPage = lazyRouteComponent(
  () => import('./routes/admin/client-models/index'),
  'ClientModelsPage',
)
const CostsPage = lazyRouteComponent(() => import('./routes/admin/costs/index'), 'CostsPage')
const ProviderStatsPage = lazyRouteComponent(
  () => import('./routes/admin/provider-stats/index'),
  'ProviderStatsPage',
)
const AiAssistPage = lazyRouteComponent(
  () => import('./routes/admin/ai-assist/index'),
  'AiAssistPage',
)
const IntentRecognitionPage = lazyRouteComponent(
  () => import('./routes/admin/intent-recognition/index'),
  'IntentRecognitionPage',
)
const RouteOverviewPage = lazyRouteComponent(
  () => import('./routes/admin/route-overview/index'),
  'RouteOverviewPage',
)

import './styles/app.css'

const rootRoute = createRootRoute({ component: RootLayout })

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/login',
  component: LoginPage,
})
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  component: () => {
    React.useEffect(() => {
      window.location.href = '/login'
    }, [])
    return null
  },
})

const adminRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/admin',
  component: AdminLayout,
})

const dashboardRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/dashboard',
  component: DashboardPage,
})
const indexRoute2 = createRoute({
  getParentRoute: () => adminRoute,
  path: '/',
  component: DashboardPage,
})
const providersRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/providers',
  component: ProvidersPage,
})
const keysRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/keys',
  component: KeysPage,
})
const modelGroupsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/model-groups',
  component: ModelGroupsPage,
})
const settingsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/settings',
  component: SettingsPage,
})
const accessModelsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/access-models',
  component: AccessModelsPage,
})
const accessModelDetailRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/access-models/$accessModelId',
  component: AccessModelDetailPage,
})
const potentialModelsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/potential-models',
  component: PotentialModelsPage,
})
const circuitBreakerRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/circuit-breaker',
  component: CircuitBreakerPage,
})
const logsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/logs',
  component: LogsPage,
})
const logDetailRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/logs/$logId',
  component: LogDetailPage,
})
const routingTracesRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/routing-traces',
  component: RoutingTracesPage,
})
const routingTraceDetailRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/routing-traces/$logId',
  component: RoutingTraceDetailPage,
})
const consoleLogsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/console-logs',
  component: ConsoleLogsPage,
})
const metricsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/metrics',
  component: MetricsPage,
})
const clientModelsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/client-models',
  component: ClientModelsPage,
})
const costsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/costs',
  component: CostsPage,
})
const providerStatsRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/provider-stats',
  component: ProviderStatsPage,
})
const aiAssistRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/ai-assist',
  component: AiAssistPage,
})
const intentRecognitionRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/intent-recognition',
  component: IntentRecognitionPage,
})
const routeOverviewRoute = createRoute({
  getParentRoute: () => adminRoute,
  path: '/route-overview',
  component: RouteOverviewPage,
})

const routeTree = rootRoute.addChildren([
  loginRoute,
  indexRoute,
  adminRoute.addChildren([
    dashboardRoute,
    indexRoute2,
    providersRoute,
    keysRoute,
    modelGroupsRoute,
    settingsRoute,
    accessModelsRoute,
    accessModelDetailRoute,
    potentialModelsRoute,
    circuitBreakerRoute,
    logsRoute,
    logDetailRoute,
    routingTracesRoute,
    routingTraceDetailRoute,
    consoleLogsRoute,
    metricsRoute,
    clientModelsRoute,
    costsRoute,
    providerStatsRoute,
    aiAssistRoute,
    intentRecognitionRoute,
    routeOverviewRoute,
  ]),
])
const router = createRouter({
  routeTree,
  defaultNotFoundComponent: () => {
    console.warn('[Router404]', window.location.pathname)
    return <div data-testid="route-404">{window.location.pathname} not found</div>
  },
  defaultPendingComponent: () => {
    console.log('[RouterPending]', window.location.pathname)
    return <div data-testid="route-pending">loading...</div>
  },
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<RouterProvider router={router} />)
