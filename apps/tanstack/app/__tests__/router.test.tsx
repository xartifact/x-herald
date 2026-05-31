import { describe, it, expect, mock } from 'bun:test'

// Monaco-editor accesses `window` at module load time and breaks in test environment.
// Mock it before any transitive import from @x-llm-gateway/ui resolves it.
mock.module('monaco-editor', () => ({
  editor: {},
  languages: {},
}))

mock.module('@monaco-editor/react', () => ({
  default: () => null,
  DiffEditor: () => null,
  loader: { config: () => {} },
}))

import { createRoute, createRootRoute, createRouter } from '@tanstack/react-router'

describe('TanStack Router', () => {
  it('imports all page components without errors', async () => {
    const [{ RootLayout }, { LoginPage }, { AdminLayout }] = await Promise.all([
      import('../routes/__root'),
      import('../routes/login'),
      import('../routes/admin'),
    ])

    expect(typeof RootLayout).toBe('function')
    expect(typeof LoginPage).toBe('function')
    expect(typeof AdminLayout).toBe('function')
  })

  it('creates a router with correct route tree structure', async () => {
    const [
      { RootLayout },
      { LoginPage },
      { AdminLayout },
      { DashboardPage },
      { ProvidersPage },
      { KeysPage },
      { ModelGroupsPage },
      { SettingsPage },
      { AccessModelsPage },
      { CircuitBreakerPage },
      { LogsPage },
      { MetricsPage },
      { ClientModelsPage },
      { ProviderStatsPage },
    ] = await Promise.all([
      import('../routes/__root'),
      import('../routes/login'),
      import('../routes/admin'),
      import('../routes/admin/index'),
      import('../routes/admin/providers/index'),
      import('../routes/admin/keys/index'),
      import('../routes/admin/model-groups/index'),
      import('../routes/admin/settings/index'),
      import('../routes/admin/access-models/index'),
      import('../routes/admin/circuit-breaker/index'),
      import('../routes/admin/logs/index'),
      import('../routes/admin/metrics/index'),
      import('../routes/admin/client-models/index'),
      import('../routes/admin/provider-stats/index'),
    ])

    const rootRoute = createRootRoute({ component: RootLayout })
    const loginRoute = createRoute({ getParentRoute: () => rootRoute, path: '/login', component: LoginPage })
    const indexRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: '/',
      component: () => null,
    })
    const adminRoute = createRoute({ getParentRoute: () => rootRoute, path: '/admin', component: AdminLayout })
    const dashboardRoute = createRoute({ getParentRoute: () => adminRoute, path: '/', component: DashboardPage })
    const providersRoute = createRoute({ getParentRoute: () => adminRoute, path: '/providers', component: ProvidersPage })
    const keysRoute = createRoute({ getParentRoute: () => adminRoute, path: '/keys', component: KeysPage })
    const modelGroupsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/model-groups', component: ModelGroupsPage })
    const settingsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/settings', component: SettingsPage })
    const accessModelsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/access-models', component: AccessModelsPage })
    const circuitBreakerRoute = createRoute({ getParentRoute: () => adminRoute, path: '/circuit-breaker', component: CircuitBreakerPage })
    const logsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/logs', component: LogsPage })
    const metricsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/metrics', component: MetricsPage })
    const clientModelsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/client-models', component: ClientModelsPage })
    const providerStatsRoute = createRoute({ getParentRoute: () => adminRoute, path: '/provider-stats', component: ProviderStatsPage })

    adminRoute.addChildren([
      dashboardRoute, providersRoute, keysRoute, modelGroupsRoute,
      settingsRoute, accessModelsRoute, circuitBreakerRoute,
      logsRoute, metricsRoute, clientModelsRoute, providerStatsRoute,
    ])

    const routeTree = rootRoute.addChildren([loginRoute, indexRoute, adminRoute])
    const router = createRouter({ routeTree })

    expect(router).toBeDefined()
    expect(router.routeTree).toBeDefined()

    const rootChildren = router.routeTree.children
    expect(rootChildren).toBeDefined()
    if (!rootChildren) return
    expect(rootChildren.length).toBe(3)

    const pathMap = new Map<string, any>()
    for (const child of rootChildren) {
      pathMap.set(child.path, child)
    }

    // TanStack Router stores paths without leading slash for child routes
    expect(pathMap.has('login')).toBe(true)
    expect(pathMap.has('/')).toBe(true)
    expect(pathMap.has('admin')).toBe(true)

    const adminChild = pathMap.get('admin')
    expect(adminChild).toBeDefined()
    expect(adminChild.children).toBeDefined()
    expect(adminChild.children.length).toBe(11)

    const adminPaths = new Set(adminChild.children.map((c: any) => c.path))
    expect(adminPaths.has('/')).toBe(true) // dashboard
    expect(adminPaths.has('providers')).toBe(true)
    expect(adminPaths.has('keys')).toBe(true)
    expect(adminPaths.has('model-groups')).toBe(true)
    expect(adminPaths.has('settings')).toBe(true)
    expect(adminPaths.has('access-models')).toBe(true)
    expect(adminPaths.has('circuit-breaker')).toBe(true)
    expect(adminPaths.has('logs')).toBe(true)
    expect(adminPaths.has('metrics')).toBe(true)
    expect(adminPaths.has('client-models')).toBe(true)
    expect(adminPaths.has('provider-stats')).toBe(true)
  })
})
