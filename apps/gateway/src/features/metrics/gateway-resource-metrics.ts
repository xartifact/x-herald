/**
 * Gateway resource snapshots — periodic gauges that reflect current DB/cache state.
 *
 * Updated by installResourceGauges() via setInterval (default 30s). Cheap
 * to refresh — each gauge is a single COUNT or .size lookup.
 */

import { sql } from '@xartifact/x-herald-db'

import { getDatabase } from '../../db/client'
import { accessModels, modelGroups, virtualKeys } from '@xartifact/x-herald-db'
import { peekAllActiveRouteRules } from '../../features/route-rules/service'
import { getRouteRuleEngine } from '../../gateway/services/route-rule-engine'
import { getMetricsRegistry } from './prometheus-service'
import promClient from 'prom-client'

const routeRulesActive = new promClient.Gauge({
  name: 'gateway_route_rules_active_total',
  help: 'Number of active route_rules records currently loaded into memory cache',
  registers: [getMetricsRegistry()],
})

const routeRuleMatchers = new promClient.Gauge({
  name: 'gateway_route_rule_matchers_total',
  help: 'Number of RouteMatcher entries compiled across all access models',
  registers: [getMetricsRegistry()],
})

const accessModelsByEnabled = new promClient.Gauge({
  name: 'gateway_access_models_total',
  help: 'Count of access_models rows, labeled by enabled flag',
  labelNames: ['enabled'] as const,
  registers: [getMetricsRegistry()],
})

const modelGroupsByEnabled = new promClient.Gauge({
  name: 'gateway_model_groups_total',
  help: 'Count of model_groups rows, labeled by enabled flag',
  labelNames: ['enabled'] as const,
  registers: [getMetricsRegistry()],
})

const virtualKeysGauge = new promClient.Gauge({
  name: 'gateway_virtual_keys_total',
  help: 'Total count of virtual_keys rows',
  registers: [getMetricsRegistry()],
})

async function refreshSnapshots(): Promise<void> {
  routeRulesActive.set(peekAllActiveRouteRules().length)
  try {
    routeRuleMatchers.set(getRouteRuleEngine().getAllMatchers().length)
  } catch {
    /* route rule engine not initialized */
  }

  try {
    const db = getDatabase()
    const amRows = await db
      .select({
        enabled: sql<boolean>`(${accessModels.enabled})::bool`,
        count: sql<number>`count(*)::int`,
      })
      .from(accessModels)
      .groupBy(accessModels.enabled)
    for (const r of amRows) {
      accessModelsByEnabled.set({ enabled: String(r.enabled) }, r.count)
    }

    const mgRows = await db
      .select({
        enabled: sql<boolean>`(${modelGroups.enabled})::bool`,
        count: sql<number>`count(*)::int`,
      })
      .from(modelGroups)
      .groupBy(modelGroups.enabled)
    for (const r of mgRows) {
      modelGroupsByEnabled.set({ enabled: String(r.enabled) }, r.count)
    }

    const vkRows = await db.select({ count: sql<number>`count(*)::int` }).from(virtualKeys)
    virtualKeysGauge.set(vkRows[0]?.count ?? 0)
  } catch {
    /* DB not ready yet (boot race) — try next tick */
  }
}

let installed = false
let intervalHandle: ReturnType<typeof setInterval> | null = null

/**
 * Start the periodic refresh loop. Idempotent.
 * @param intervalMs default 30s — long enough to be cheap, short enough to feel live.
 */
export function installResourceGauges(intervalMs = 30_000): void {
  if (installed) return
  installed = true
  void refreshSnapshots()
  intervalHandle = setInterval(() => {
    void refreshSnapshots()
  }, intervalMs)
}

export function stopResourceGauges(): void {
  if (intervalHandle) clearInterval(intervalHandle)
  intervalHandle = null
  installed = false
}
