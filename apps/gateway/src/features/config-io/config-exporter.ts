import { getDatabase } from '../../index'
import { gatewayConfigs } from '../../index'
import { virtualKeys } from '../../index'
import { accessModels, modelGroupMemberships, modelGroups, modelInstances } from '../../index'
import { providers } from '../../index'

import { EXPORT_VERSION, type EngineExportFormat } from './types'

export async function exportConfig(): Promise<EngineExportFormat> {
  const db = getDatabase()

  const [
    allProviders,
    allModelGroups,
    allModelInstances,
    allAccessModels,
    allVirtualKeys,
    allGatewayConfigs,
    allMemberships,
  ] = await Promise.all([
    db.select().from(providers),
    db.select().from(modelGroups),
    db.select().from(modelInstances),
    db.select().from(accessModels),
    db.select().from(virtualKeys),
    db.select().from(gatewayConfigs),
    db.select().from(modelGroupMemberships),
  ])

  const instanceGroupIds = new Map<string, string[]>()
  for (const m of allMemberships) {
    const arr = instanceGroupIds.get(m.instanceId) ?? []
    arr.push(m.groupId)
    instanceGroupIds.set(m.instanceId, arr)
  }

  const providerIdToName = new Map(allProviders.map((p) => [p.id, p.name]))
  const groupIdToName = new Map(allModelGroups.map((g) => [g.id, g.name]))

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      providers: allProviders.map((p) => ({
        name: p.name,
        apiKey: p.apiKey,
        protocols: p.protocols,
        enabled: p.enabled,
      })),

      modelGroups: allModelGroups.map((g) => ({
        name: g.name,
        aliases: (g.aliases as string[]) ?? [],
        displayName: g.displayName,
        description: g.description,
        category: g.category,
        capabilities: g.capabilities,
        supportedProtocols: (g.supportedProtocols as string[]) ?? ['openai'],
        enabled: g.enabled,
        metadata: g.metadata,
      })),

      modelInstances: allModelInstances.map((i) => {
        const gids = instanceGroupIds.get(i.id) ?? []
        const groupNames = gids.map((gid) => groupIdToName.get(gid) ?? '').filter(Boolean)
        return {
          name: i.name,
          actualModelName: i.actualModelName,
          description: i.description,
          providerName: providerIdToName.get(i.providerId) ?? '',
          groupNames,
          groupName: groupNames[0] ?? null,
          config: i.config,
          weight: i.weight,
          costPer1kTokens: i.costPer1kTokens,
          healthCheckUrl: i.healthCheckUrl,
          enabled: i.enabled,
          metadata: i.metadata,
        }
      }),

      virtualModels: allAccessModels.map((v) => ({
        name: v.name,
        displayName: v.displayName,
        description: v.description,
        enabled: v.enabled,
      })),

      virtualKeys: allVirtualKeys.map((k) => ({
        name: k.name,
        key: k.key,
        allowedModels: k.allowedModels,
        rateLimitRpm: k.rateLimitRpm,
        rateLimitRpd: k.rateLimitRpd,
        tokenLimitDaily: k.tokenLimitDaily != null ? String(k.tokenLimitDaily) : null,
        enabled: k.enabled,
        expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
      })),

      gatewayConfigs: allGatewayConfigs.map((c) => ({
        key: c.key,
        value: c.value,
        description: c.description,
      })),
    },
  }
}
