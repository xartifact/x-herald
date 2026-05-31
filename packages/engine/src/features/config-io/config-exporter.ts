import { getDatabase } from '@x-llm-gateway/engine';
import { gatewayConfigs } from '@x-llm-gateway/engine';
import { virtualKeys } from '@x-llm-gateway/engine';
import {
  accessModels,
  modelGroupMemberships,
  modelGroups,
  modelInstances,
  modelRoutes,
} from '@x-llm-gateway/engine';
import { providers } from '@x-llm-gateway/engine';

import { EXPORT_VERSION, type ExportFormat, type ExportedModelRoute } from './types';

export async function exportConfig(): Promise<ExportFormat> {
  const db = getDatabase();

  const [
    allProviders,
    allModelGroups,
    allModelInstances,
    allAccessModels,
    allModelRoutes,
    allVirtualKeys,
    allGatewayConfigs,
    allMemberships,
  ] = await Promise.all([
    db.select().from(providers),
    db.select().from(modelGroups),
    db.select().from(modelInstances),
    db.select().from(accessModels),
    db.select().from(modelRoutes),
    db.select().from(virtualKeys),
    db.select().from(gatewayConfigs),
    db.select().from(modelGroupMemberships),
  ]);

  const instanceGroupIds = new Map<string, string[]>();
  for (const m of allMemberships) {
    const arr = instanceGroupIds.get(m.instanceId) ?? [];
    arr.push(m.groupId);
    instanceGroupIds.set(m.instanceId, arr);
  }

  const providerIdToName = new Map(allProviders.map((p) => [p.id, p.name]));
  const groupIdToName = new Map(allModelGroups.map((g) => [g.id, g.name]));
  const virtualModelIdToName = new Map(allAccessModels.map((v) => [v.id, v.name]));
  const instanceIdToRef = new Map(
    allModelInstances.map((i) => [
      i.id,
      `${providerIdToName.get(i.providerId) ?? ''}/${i.actualModelName}`,
    ]),
  );

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
        const gids = instanceGroupIds.get(i.id) ?? [];
        const groupNames = gids.map((gid) => groupIdToName.get(gid) ?? '').filter(Boolean);
        return {
          name: i.name,
          actualModelName: i.actualModelName,
          description: i.description,
          providerName: providerIdToName.get(i.providerId) ?? '',
          groupNames,
          groupName: groupNames[0] ?? null,
          config: i.config,
          weight: i.weight,
          priority: i.priority,
          costPer1kTokens: i.costPer1kTokens,
          healthCheckUrl: i.healthCheckUrl,
          enabled: i.enabled,
          metadata: i.metadata,
        };
      }),

      virtualModels: allAccessModels.map((v) => ({
        name: v.name,
        displayName: v.displayName,
        description: v.description,
        enabled: v.enabled,
      })),

      modelRoutes: allModelRoutes.map((r) => {
        const action = r.action as { type: string; targetId?: string; reason?: string };
        let targetRef: string | undefined;
        if (action.targetId) {
          if (action.type === 'route_to_access_model') {
            targetRef = virtualModelIdToName.get(action.targetId);
          } else if (action.type === 'route_to_group') {
            targetRef = groupIdToName.get(action.targetId);
          } else if (action.type === 'route_to_instance') {
            targetRef = instanceIdToRef.get(action.targetId);
          }
        }
        const virtualModelNames = (r.accessModelIds ?? [])
          .map((id) => virtualModelIdToName.get(id))
          .filter((name): name is string => name != null);
        return {
          name: r.name,
          description: r.description,
          virtualModelNames,
          virtualModelName: virtualModelNames[0] ?? null,
          conditions: (r.conditions as unknown[]) ?? [],
          action: { type: action.type, targetRef, reason: action.reason },
          priority: r.priority,
          enabled: r.enabled,
          flowData: r.flowData,
        } satisfies ExportedModelRoute;
      }),

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
  };
}
