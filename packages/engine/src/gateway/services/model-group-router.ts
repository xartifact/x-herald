import { eq, and, asc } from 'drizzle-orm';

import { getDatabase } from '../../db/client';
import logger from '../../lib/logger';
import { fetchGroupInstancesPerf } from '../../features/metrics/services/instance-perf-cache';
import { modelGroups, modelInstances, modelGroupMemberships } from '../../features/model-groups/db';
import type { ModelGroup, ModelInstance } from '../../features/model-groups/types';
import { providers } from '../../features/providers/db';

import { selectByStrategy, filterCandidates } from './router-selector';
import type { RouteResult, RoutingContext } from './router-selector';

export type { RouteResult, RoutingContext } from './router-selector';
export {
  FAILOVER_STATUS_CODES,
  ModelNotFoundError,
  ModelDisabledError,
  NoAvailableInstanceError,
  NoSuitableInstanceError,
  RequestRejectedError,
} from './router-selector';

export class ModelGroupRouter {
  async routeCandidatesByGroupId(groupId: string, context: RoutingContext): Promise<RouteResult[]> {
    const db = getDatabase();

    const groupResult = await db.select().from(modelGroups).where(eq(modelGroups.id, groupId)).limit(1);
    if (groupResult.length === 0 || !groupResult[0].enabled) return [];

    const group = groupResult[0];
    const instances = await db
      .select({ instance: modelInstances, provider: providers })
      .from(modelGroupMemberships)
      .innerJoin(modelInstances, eq(modelGroupMemberships.instanceId, modelInstances.id))
      .innerJoin(providers, eq(modelInstances.providerId, providers.id))
      .where(and(eq(modelGroupMemberships.groupId, group.id), eq(modelInstances.enabled, true), eq(providers.enabled, true)))
      .orderBy(asc(modelInstances.priority), asc(modelInstances.createdAt));

    if (instances.length === 0) return [];

    const filtered = filterCandidates(instances, context, group);
    if (filtered.length === 0) return [];

    const strategy = group.routingConfig?.strategy ?? 'priority';
    const sorted = await selectByStrategy(filtered, strategy, group.id);
    const perfMap = await fetchGroupInstancesPerf(group.id);

    logger.debug({ groupId, strategy, totalCandidates: filtered.length }, 'Routing candidates resolved');

    return sorted.map((c, idx) => ({
      instance: c.instance,
      provider: c.provider,
      group,
      decision: {
        strategy,
        reason: idx === 0
          ? `${strategy} selection (priority: ${c.instance.priority})`
          : `${strategy} failover candidate #${idx + 1}`,
        candidates: filtered.length,
      },
      mapping: {
        modelName: group.name,
        isMapped: true,
        originalModel: context.requestedModel,
        mappingType: 'virtual' as const,
      },
      perf: perfMap.get(c.instance.id),
    }));
  }

  async routeByGroupId(groupId: string, context: RoutingContext): Promise<RouteResult | null> {
    const candidates = await this.routeCandidatesByGroupId(groupId, context);
    return candidates[0] ?? null;
  }

  async listModelGroups(): Promise<ModelGroup[]> {
    return getDatabase().select().from(modelGroups).where(eq(modelGroups.enabled, true));
  }

  async getModelGroupDetail(groupId: string): Promise<{
    group: ModelGroup;
    instances: Array<{ instance: ModelInstance; provider: typeof providers.$inferSelect }>;
  } | null> {
    const db = getDatabase();
    const group = await db.select().from(modelGroups).where(eq(modelGroups.id, groupId)).limit(1);
    if (group.length === 0) return null;

    const instances = await db
      .select({ instance: modelInstances, provider: providers })
      .from(modelGroupMemberships)
      .innerJoin(modelInstances, eq(modelGroupMemberships.instanceId, modelInstances.id))
      .innerJoin(providers, eq(modelInstances.providerId, providers.id))
      .where(eq(modelGroupMemberships.groupId, groupId))
      .orderBy(asc(modelInstances.priority), asc(modelInstances.createdAt));

    return { group: group[0], instances };
  }
}

export const modelGroupRouter = new ModelGroupRouter();
