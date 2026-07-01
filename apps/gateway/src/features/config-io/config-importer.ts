import { and, eq, sql } from '@xartifact/x-llm-gateway-db';

import { getDatabase } from '../../index';
import { rootLogger } from '../../index';
import { invalidateVirtualKeyCache } from '../../middleware';
import { gatewayConfigs } from '../../index';
import { virtualKeys } from '../../index';
import {
  accessModels,
  modelGroupMemberships,
  modelGroups,
  modelInstances,
  modelRoutes,
} from '../../index';
import { providers } from '../../index';

import { type EngineExportFormat, type EngineImportResult, type ImportSummaryItem } from './types';

const logger = rootLogger.child({ module: 'config-io' });

function emptySummary(): ImportSummaryItem {
  return { created: 0, updated: 0, errors: 0 };
}

export async function importConfig(data: EngineExportFormat['data']): Promise<EngineImportResult> {
  const db = getDatabase();
  const errors: string[] = [];

  const summary: EngineImportResult['summary'] = {
    providers: emptySummary(),
    modelGroups: emptySummary(),
    modelInstances: emptySummary(),
    virtualModels: emptySummary(),
    accessModels: emptySummary(),
    modelRoutes: emptySummary(),
    virtualKeys: emptySummary(),
    gatewayConfigs: emptySummary(),
  };

  const providerNameToId = new Map<string, string>();
  const groupNameToId = new Map<string, string>();
  const virtualModelNameToId = new Map<string, string>();
  const instanceRefToId = new Map<string, string>();

  // ── 1. providers ────────────────────────────────────────────────────────
  for (const p of data.providers) {
    try {
      const existing = await db.select({ id: providers.id }).from(providers).where(eq(providers.name, p.name)).limit(1);
      if (existing.length > 0) {
        await db.update(providers).set({ apiKey: p.apiKey, protocols: p.protocols as never, enabled: p.enabled, updatedAt: new Date() }).where(eq(providers.id, existing[0].id));
        providerNameToId.set(p.name, existing[0].id);
        summary.providers.updated++;
      } else {
        const [created] = await db.insert(providers).values({ name: p.name, apiKey: p.apiKey, protocols: p.protocols as never, enabled: p.enabled }).returning({ id: providers.id });
        providerNameToId.set(p.name, created.id);
        summary.providers.created++;
      }
    } catch (err) {
      errors.push(`Provider "${p.name}": ${err instanceof Error ? err.message : String(err)}`);
      logger.warn({ err, name: p.name }, '[Import] Failed to upsert provider');
      summary.providers.errors++;
    }
  }

  // ── 2. modelGroups ───────────────────────────────────────────────────────
  for (const g of data.modelGroups) {
    try {
      const existing = await db.select({ id: modelGroups.id }).from(modelGroups).where(eq(modelGroups.name, g.name)).limit(1);
      if (existing.length > 0) {
        await db.update(modelGroups).set({
          aliases: g.aliases, displayName: g.displayName, description: g.description,
          category: g.category, capabilities: g.capabilities as never,
          supportedProtocols: g.supportedProtocols, enabled: g.enabled,
          metadata: g.metadata as never, updatedAt: new Date(),
        }).where(eq(modelGroups.id, existing[0].id));
        groupNameToId.set(g.name, existing[0].id);
        summary.modelGroups.updated++;
      } else {
        const [created] = await db.insert(modelGroups).values({
          name: g.name, aliases: g.aliases, displayName: g.displayName,
          description: g.description, category: g.category,
          capabilities: g.capabilities as never, supportedProtocols: g.supportedProtocols,
          enabled: g.enabled, metadata: g.metadata as never,
        }).returning({ id: modelGroups.id });
        groupNameToId.set(g.name, created.id);
        summary.modelGroups.created++;
      }
    } catch (err) {
      errors.push(`ModelGroup "${g.name}": ${err instanceof Error ? err.message : String(err)}`);
      logger.warn({ err, name: g.name }, '[Import] Failed to upsert model group');
      summary.modelGroups.errors++;
    }
  }

  // ── 3. accessModels ──────────────────────────────────────────────────────
  const amList = data.accessModels ?? data.virtualModels ?? [];
  for (const v of amList) {
    try {
      const existing = await db.select({ id: accessModels.id }).from(accessModels).where(eq(accessModels.name, v.name)).limit(1);
      if (existing.length > 0) {
        await db.update(accessModels).set({ displayName: v.displayName, description: v.description, enabled: v.enabled, updatedAt: new Date() }).where(eq(accessModels.id, existing[0].id));
        virtualModelNameToId.set(v.name, existing[0].id);
        summary.accessModels.updated++;
        summary.virtualModels.updated++;
      } else {
        const [created] = await db.insert(accessModels).values({ name: v.name, displayName: v.displayName, description: v.description, enabled: v.enabled }).returning({ id: accessModels.id });
        virtualModelNameToId.set(v.name, created.id);
        summary.accessModels.created++;
        summary.virtualModels.created++;
      }
    } catch (err) {
      errors.push(`AccessModel "${v.name}": ${err instanceof Error ? err.message : String(err)}`);
      logger.warn({ err, name: v.name }, '[Import] Failed to upsert access model');
      summary.accessModels.errors++;
      summary.virtualModels.errors++;
    }
  }

  // ── 4. virtualKeys ───────────────────────────────────────────────────────
  for (const k of data.virtualKeys) {
    try {
      const existing = await db.select({ id: virtualKeys.id }).from(virtualKeys).where(eq(virtualKeys.name, k.name)).limit(1);
      const tokenLimitDaily = k.tokenLimitDaily != null ? BigInt(k.tokenLimitDaily) : null;
      if (existing.length > 0) {
        await db.update(virtualKeys).set({
          key: k.key, allowedModels: k.allowedModels, rateLimitRpm: k.rateLimitRpm,
          rateLimitRpd: k.rateLimitRpd, tokenLimitDaily, enabled: k.enabled,
          expiresAt: k.expiresAt ? new Date(k.expiresAt) : null, updatedAt: new Date(),
        }).where(eq(virtualKeys.id, existing[0].id));
        invalidateVirtualKeyCache(k.key);
        summary.virtualKeys.updated++;
      } else {
        await db.insert(virtualKeys).values({
          name: k.name, key: k.key, allowedModels: k.allowedModels,
          rateLimitRpm: k.rateLimitRpm, rateLimitRpd: k.rateLimitRpd,
          tokenLimitDaily, enabled: k.enabled,
          expiresAt: k.expiresAt ? new Date(k.expiresAt) : null,
        });
        invalidateVirtualKeyCache(k.key);
        summary.virtualKeys.created++;
      }
    } catch (err) {
      errors.push(`VirtualKey "${k.name}": ${err instanceof Error ? err.message : String(err)}`);
      logger.warn({ err, name: k.name }, '[Import] Failed to upsert virtual key');
      summary.virtualKeys.errors++;
    }
  }

  // ── 5. gatewayConfigs ────────────────────────────────────────────────────
  for (const c of data.gatewayConfigs) {
    try {
      const existing = await db.select({ id: gatewayConfigs.id }).from(gatewayConfigs).where(eq(gatewayConfigs.key, c.key)).limit(1);
      if (existing.length > 0) {
        await db.update(gatewayConfigs).set({ value: c.value as never, description: c.description, updatedAt: new Date() }).where(eq(gatewayConfigs.id, existing[0].id));
        summary.gatewayConfigs.updated++;
      } else {
        await db.insert(gatewayConfigs).values({ key: c.key, value: c.value as never, description: c.description });
        summary.gatewayConfigs.created++;
      }
    } catch (err) {
      errors.push(`GatewayConfig "${c.key}": ${err instanceof Error ? err.message : String(err)}`);
      logger.warn({ err, key: c.key }, '[Import] Failed to upsert gateway config');
      summary.gatewayConfigs.errors++;
    }
  }

  // ── 6. modelInstances ────────────────────────────────────────────────────
  for (const i of data.modelInstances) {
    try {
      const providerId = providerNameToId.get(i.providerName);
      if (!providerId) {
        errors.push(`ModelInstance "${i.name}": provider "${i.providerName}" not found after import`);
        summary.modelInstances.errors++;
        continue;
      }

      const targetGroupNames = (i.groupNames && i.groupNames.length > 0)
        ? i.groupNames
        : (i.groupName ? [i.groupName] : []);
      const resolvedGroupIds = targetGroupNames
        .map((name) => groupNameToId.get(name))
        .filter((id): id is string => id != null);

      const existing = await db.select({ id: modelInstances.id }).from(modelInstances).where(
        and(eq(modelInstances.providerId, providerId), eq(modelInstances.actualModelName, i.actualModelName)),
      ).limit(1);

      const instanceRef = `${i.providerName}/${i.actualModelName}`;
      let instanceId: string;

      if (existing.length > 0) {
        await db.update(modelInstances).set({
          name: i.name, description: i.description, config: i.config as never,
          weight: i.weight, priority: i.priority, costPer1kTokens: i.costPer1kTokens as never,
          healthCheckUrl: i.healthCheckUrl, enabled: i.enabled, metadata: i.metadata as never,
          updatedAt: new Date(),
        }).where(eq(modelInstances.id, existing[0].id));
        instanceId = existing[0].id;
        instanceRefToId.set(instanceRef, instanceId);
        summary.modelInstances.updated++;
      } else {
        const [created] = await db.insert(modelInstances).values({
          providerId, name: i.name, actualModelName: i.actualModelName,
          description: i.description, config: i.config as never, weight: i.weight,
          priority: i.priority, costPer1kTokens: i.costPer1kTokens as never,
          healthCheckUrl: i.healthCheckUrl, enabled: i.enabled, metadata: i.metadata as never,
        }).returning({ id: modelInstances.id });
        instanceId = created.id;
        instanceRefToId.set(instanceRef, instanceId);
        summary.modelInstances.created++;
      }

      if (resolvedGroupIds.length > 0) {
        await db.delete(modelGroupMemberships).where(eq(modelGroupMemberships.instanceId, instanceId));
        await db.insert(modelGroupMemberships).values(resolvedGroupIds.map((gid) => ({ groupId: gid, instanceId })));
      }
    } catch (err) {
      errors.push(`ModelInstance "${i.name}": ${err instanceof Error ? err.message : String(err)}`);
      logger.warn({ err, name: i.name }, '[Import] Failed to upsert model instance');
      summary.modelInstances.errors++;
    }
  }

  // ── 7. modelRoutes ───────────────────────────────────────────────────────
  for (const r of data.modelRoutes) {
    try {
      const names = r.virtualModelNames && r.virtualModelNames.length > 0
        ? r.virtualModelNames
        : (r.virtualModelName ? [r.virtualModelName] : []);
      const accessModelIds = names
        .map((name) => virtualModelNameToId.get(name))
        .filter((id): id is string => id != null);

      let targetId: string | undefined;
      if (r.action.targetRef) {
        if (r.action.type === 'route_to_access_model' || r.action.type === 'route_to_virtual_model') {
          targetId = virtualModelNameToId.get(r.action.targetRef);
        } else if (r.action.type === 'route_to_group') {
          targetId = groupNameToId.get(r.action.targetRef);
        } else if (r.action.type === 'route_to_instance') {
          targetId = instanceRefToId.get(r.action.targetRef);
        }
      }

      const action = { type: r.action.type, targetId, reason: r.action.reason };
      const firstId = accessModelIds[0] ?? null;
      const existing = await db.select({ id: modelRoutes.id }).from(modelRoutes).where(
        and(
          firstId
            ? sql`${modelRoutes.accessModelIds} @> ARRAY[${firstId}]::text[]`
            : eq(modelRoutes.name, r.name),
          eq(modelRoutes.name, r.name),
        ),
      ).limit(1);

      if (existing.length > 0) {
        await db.update(modelRoutes).set({
          description: r.description, accessModelIds,
          conditions: r.conditions as never, action: action as never,
          priority: r.priority, enabled: r.enabled, flowData: r.flowData as never, updatedAt: new Date(),
        }).where(eq(modelRoutes.id, existing[0].id));
        summary.modelRoutes.updated++;
      } else {
        await db.insert(modelRoutes).values({
          name: r.name, description: r.description,
          accessModelIds,
          conditions: r.conditions as never, action: action as never,
          priority: r.priority, enabled: r.enabled, flowData: r.flowData as never,
        });
        summary.modelRoutes.created++;
      }
    } catch (err) {
      errors.push(`ModelRoute "${r.name}": ${err instanceof Error ? err.message : String(err)}`);
      logger.warn({ err, name: r.name }, '[Import] Failed to upsert model route');
      summary.modelRoutes.errors++;
    }
  }

  const totalErrors = errors.length;
  logger.info({ summary, totalErrors }, '[Import] Config import completed');

  return { success: totalErrors === 0, summary, errors };
}
