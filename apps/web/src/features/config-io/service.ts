import { eq, and, sql } from 'drizzle-orm';

import { getDatabase } from '@/core/db/client';
import rootLogger from '@/core/lib/logger';
import { invalidateVirtualKeyCache } from '@/features/gateway/middleware/virtual-key';
import { gatewayConfigs } from '@/features/gateway-config/db';
import { virtualKeys } from '@/features/keys/db';
import {
  modelGroups,
  modelInstances,
  modelGroupMemberships,
  modelRoutes,
  accessModels,
} from '@/features/model-groups/db';
import { providers } from '@/features/providers/db';

import {
  EXPORT_VERSION,
  type ExportFormat,
  type ExportedModelRoute,
  type ImportResult,
  type ImportSummaryItem,
} from './types';

const logger = rootLogger.child({ module: 'config-io' });

// ─── Export ─────────────────────────────────────────────────────────────────

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

  // 构建辅助查找表
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
        return {
          name: r.name,
          description: r.description,
          virtualModelName: (r.accessModelIds && r.accessModelIds.length > 0)
            ? (virtualModelIdToName.get(r.accessModelIds[0]) ?? null)
            : null,
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

// ─── Import ──────────────────────────────────────────────────────────────────

function emptySummary(): ImportSummaryItem {
  return { created: 0, updated: 0, errors: 0 };
}

export async function importConfig(data: ExportFormat["data"]): Promise<ImportResult> {
  const db = getDatabase();
  const errors: string[] = [];

  const summary: ImportResult['summary'] = {
    providers: emptySummary(),
    modelGroups: emptySummary(),
    modelInstances: emptySummary(),
    virtualModels: emptySummary(),
    accessModels: emptySummary(),
    modelRoutes: emptySummary(),
    virtualKeys: emptySummary(),
    gatewayConfigs: emptySummary(),
  };

  // 用于解析外键的名称→ID 映射（导入后实际 ID）
  const providerNameToId = new Map<string, string>();
  const groupNameToId = new Map<string, string>();
  const virtualModelNameToId = new Map<string, string>();
  const instanceRefToId = new Map<string, string>(); // "{providerName}/{actualModelName}" → id

  // ── 1. providers ────────────────────────────────────────────────────────
  for (const p of data.providers) {
    try {
      const existing = await db
        .select({ id: providers.id })
        .from(providers)
        .where(eq(providers.name, p.name))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(providers)
          .set({ apiKey: p.apiKey, protocols: p.protocols as never, enabled: p.enabled, updatedAt: new Date() })
          .where(eq(providers.id, existing[0].id));
        providerNameToId.set(p.name, existing[0].id);
        summary.providers.updated++;
      } else {
        const [created] = await db
          .insert(providers)
          .values({ name: p.name, apiKey: p.apiKey, protocols: p.protocols as never, enabled: p.enabled })
          .returning({ id: providers.id });
        providerNameToId.set(p.name, created.id);
        summary.providers.created++;
      }
    } catch (err) {
      const msg = `Provider "${p.name}": ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.warn({ err, name: p.name }, '[Import] Failed to upsert provider');
      summary.providers.errors++;
    }
  }

  // ── 2. modelGroups ───────────────────────────────────────────────────────
  for (const g of data.modelGroups) {
    try {
      const existing = await db
        .select({ id: modelGroups.id })
        .from(modelGroups)
        .where(eq(modelGroups.name, g.name))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(modelGroups)
          .set({
            aliases: g.aliases,
            displayName: g.displayName,
            description: g.description,
            category: g.category,
            capabilities: g.capabilities as never,
            supportedProtocols: g.supportedProtocols,
            enabled: g.enabled,
            metadata: g.metadata as never,
            updatedAt: new Date(),
          })
          .where(eq(modelGroups.id, existing[0].id));
        groupNameToId.set(g.name, existing[0].id);
        summary.modelGroups.updated++;
      } else {
        const [created] = await db
          .insert(modelGroups)
          .values({
            name: g.name,
            aliases: g.aliases,
            displayName: g.displayName,
            description: g.description,
            category: g.category,
            capabilities: g.capabilities as never,
            supportedProtocols: g.supportedProtocols,
            enabled: g.enabled,
            metadata: g.metadata as never,
          })
          .returning({ id: modelGroups.id });
        groupNameToId.set(g.name, created.id);
        summary.modelGroups.created++;
      }
    } catch (err) {
      const msg = `ModelGroup "${g.name}": ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.warn({ err, name: g.name }, '[Import] Failed to upsert model group');
      summary.modelGroups.errors++;
    }
  }

  // ── 3. accessModels (formerly virtualModels) ─────────────────────────────
  const amList = data.accessModels ?? data.virtualModels ?? [];
  for (const v of amList) {
    try {
      const existing = await db
        .select({ id: accessModels.id })
        .from(accessModels)
        .where(eq(accessModels.name, v.name))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(accessModels)
          .set({ displayName: v.displayName, description: v.description, enabled: v.enabled, updatedAt: new Date() })
          .where(eq(accessModels.id, existing[0].id));
        virtualModelNameToId.set(v.name, existing[0].id);
        summary.accessModels.updated++;
        summary.virtualModels.updated++;
      } else {
        const [created] = await db
          .insert(accessModels)
          .values({ name: v.name, displayName: v.displayName, description: v.description, enabled: v.enabled })
          .returning({ id: accessModels.id });
        virtualModelNameToId.set(v.name, created.id);
        summary.accessModels.created++;
        summary.virtualModels.created++;
      }
    } catch (err) {
      const msg = `AccessModel "${v.name}": ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.warn({ err, name: v.name }, '[Import] Failed to upsert access model');
      summary.accessModels.errors++;
      summary.virtualModels.errors++;
    }
  }

  // ── 4. virtualKeys ───────────────────────────────────────────────────────
  for (const k of data.virtualKeys) {
    try {
      const existing = await db
        .select({ id: virtualKeys.id })
        .from(virtualKeys)
        .where(eq(virtualKeys.name, k.name))
        .limit(1);

      const tokenLimitDaily = k.tokenLimitDaily != null ? BigInt(k.tokenLimitDaily) : null;

      if (existing.length > 0) {
        await db
          .update(virtualKeys)
          .set({
            key: k.key,
            allowedModels: k.allowedModels,
            rateLimitRpm: k.rateLimitRpm,
            rateLimitRpd: k.rateLimitRpd,
            tokenLimitDaily,
            enabled: k.enabled,
            expiresAt: k.expiresAt ? new Date(k.expiresAt) : null,
            updatedAt: new Date(),
          })
          .where(eq(virtualKeys.id, existing[0].id));
        invalidateVirtualKeyCache(k.key);
        summary.virtualKeys.updated++;
      } else {
        await db.insert(virtualKeys).values({
          name: k.name,
          key: k.key,
          allowedModels: k.allowedModels,
          rateLimitRpm: k.rateLimitRpm,
          rateLimitRpd: k.rateLimitRpd,
          tokenLimitDaily,
          enabled: k.enabled,
          expiresAt: k.expiresAt ? new Date(k.expiresAt) : null,
        });
        invalidateVirtualKeyCache(k.key);
        summary.virtualKeys.created++;
      }
    } catch (err) {
      const msg = `VirtualKey "${k.name}": ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.warn({ err, name: k.name }, '[Import] Failed to upsert virtual key');
      summary.virtualKeys.errors++;
    }
  }

  // ── 5. gatewayConfigs ────────────────────────────────────────────────────
  for (const c of data.gatewayConfigs) {
    try {
      const existing = await db
        .select({ id: gatewayConfigs.id })
        .from(gatewayConfigs)
        .where(eq(gatewayConfigs.key, c.key))
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(gatewayConfigs)
          .set({ value: c.value as never, description: c.description, updatedAt: new Date() })
          .where(eq(gatewayConfigs.id, existing[0].id));
        summary.gatewayConfigs.updated++;
      } else {
        await db.insert(gatewayConfigs).values({
          key: c.key,
          value: c.value as never,
          description: c.description,
        });
        summary.gatewayConfigs.created++;
      }
    } catch (err) {
      const msg = `GatewayConfig "${c.key}": ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.warn({ err, key: c.key }, '[Import] Failed to upsert gateway config');
      summary.gatewayConfigs.errors++;
    }
  }

  // ── 6. modelInstances ────────────────────────────────────────────────────
  for (const i of data.modelInstances) {
    try {
      const providerId = providerNameToId.get(i.providerName);
      if (!providerId) {
        const msg = `ModelInstance "${i.name}": provider "${i.providerName}" not found after import`;
        errors.push(msg);
        summary.modelInstances.errors++;
        continue;
      }

      // Resolve group IDs — prefer groupNames (many-to-many), fall back to groupName (compat)
      const targetGroupNames = (i.groupNames && i.groupNames.length > 0)
        ? i.groupNames
        : (i.groupName ? [i.groupName] : []);
      const resolvedGroupIds = targetGroupNames
        .map((name) => groupNameToId.get(name))
        .filter((id): id is string => id != null);

      const existing = await db
        .select({ id: modelInstances.id })
        .from(modelInstances)
        .where(
          and(
            eq(modelInstances.providerId, providerId),
            eq(modelInstances.actualModelName, i.actualModelName),
          ),
        )
        .limit(1);

      const instanceRef = `${i.providerName}/${i.actualModelName}`;
      let instanceId: string;

      if (existing.length > 0) {
        await db
          .update(modelInstances)
          .set({
            name: i.name,
            description: i.description,
            config: i.config as never,
            weight: i.weight,
            priority: i.priority,
            costPer1kTokens: i.costPer1kTokens as never,
            healthCheckUrl: i.healthCheckUrl,
            enabled: i.enabled,
            metadata: i.metadata as never,
            updatedAt: new Date(),
          })
          .where(eq(modelInstances.id, existing[0].id));
        instanceId = existing[0].id;
        instanceRefToId.set(instanceRef, instanceId);
        summary.modelInstances.updated++;
      } else {
        const [created] = await db
          .insert(modelInstances)
          .values({
            providerId,
            name: i.name,
            actualModelName: i.actualModelName,
            description: i.description,
            config: i.config as never,
            weight: i.weight,
            priority: i.priority,
            costPer1kTokens: i.costPer1kTokens as never,
            healthCheckUrl: i.healthCheckUrl,
            enabled: i.enabled,
            metadata: i.metadata as never,
          })
          .returning({ id: modelInstances.id });
        instanceId = created.id;
        instanceRefToId.set(instanceRef, instanceId);
        summary.modelInstances.created++;
      }

      // Sync group memberships
      if (resolvedGroupIds.length > 0) {
        await db.delete(modelGroupMemberships).where(eq(modelGroupMemberships.instanceId, instanceId));
        await db.insert(modelGroupMemberships).values(
          resolvedGroupIds.map((gid) => ({ groupId: gid, instanceId }))
        );
      }
    } catch (err) {
      const msg = `ModelInstance "${i.name}": ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.warn({ err, name: i.name }, '[Import] Failed to upsert model instance');
      summary.modelInstances.errors++;
    }
  }

  // ── 7. modelRoutes ───────────────────────────────────────────────────────
  for (const r of data.modelRoutes) {
    try {
      const virtualModelId = r.virtualModelName
        ? (virtualModelNameToId.get(r.virtualModelName) ?? null)
        : null;

      // 解析 action.targetId
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

      const existing = await db
        .select({ id: modelRoutes.id })
        .from(modelRoutes)
        .where(
          and(
            virtualModelId
              ? sql`${modelRoutes.accessModelIds} @> ARRAY[${virtualModelId}]::text[]`
              : eq(modelRoutes.name, r.name),
            eq(modelRoutes.name, r.name),
          ),
        )
        .limit(1);

      if (existing.length > 0) {
        await db
          .update(modelRoutes)
          .set({
            description: r.description,
            accessModelIds: virtualModelId ? [virtualModelId] : [],
            conditions: r.conditions as never,
            action: action as never,
            priority: r.priority,
            enabled: r.enabled,
            flowData: r.flowData as never,
            updatedAt: new Date(),
          })
          .where(eq(modelRoutes.id, existing[0].id));
        summary.modelRoutes.updated++;
      } else {
        await db.insert(modelRoutes).values({
          name: r.name,
          description: r.description,
          accessModelIds: virtualModelId ? [virtualModelId] : [],
          conditions: r.conditions as never,
          action: action as never,
          priority: r.priority,
          enabled: r.enabled,
          flowData: r.flowData as never,
        });
        summary.modelRoutes.created++;
      }
    } catch (err) {
      const msg = `ModelRoute "${r.name}": ${err instanceof Error ? err.message : String(err)}`;
      errors.push(msg);
      logger.warn({ err, name: r.name }, '[Import] Failed to upsert model route');
      summary.modelRoutes.errors++;
    }
  }

  const totalErrors = errors.length;
  logger.info({ summary, totalErrors }, '[Import] Config import completed');

  return {
    success: totalErrors === 0,
    summary,
    errors,
  };
}
