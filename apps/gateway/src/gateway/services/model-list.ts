import { eq, and, ne, sql } from 'drizzle-orm';

import { getDatabase } from '../../db/client';
import { CATCHALL_VM_NAME } from '../../features/access-models/constants';
import type { VirtualKey } from '@xartifact/x-llm-gateway-db';
import { modelGroups, accessModels, modelRoutes } from '@xartifact/x-llm-gateway-db';

export interface ModelCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  vision: boolean;
  jsonMode: boolean;
  reasoning: boolean;
  contextWindow: number;
  maxOutputTokens: number;
}

export interface AccessibleModel {
  name: string;
  displayName: string | null;
  createdAt: Date;
  capabilities: ModelCapabilities | null;
}

/**
 * 查询当前 virtualKey 有权访问的模型列表
 * 优先返回接入模型（含 capabilities），无接入模型时回退到模型组
 */
export async function fetchAccessibleModels(virtualKey: VirtualKey): Promise<AccessibleModel[]> {
  const db = getDatabase();

  const enabledAMs = await db
    .select({
      id: accessModels.id,
      name: accessModels.name,
      displayName: accessModels.displayName,
      capabilities: accessModels.capabilities,
      createdAt: accessModels.createdAt,
    })
    .from(accessModels)
    .where(and(eq(accessModels.enabled, true), ne(accessModels.name, CATCHALL_VM_NAME)));

  if (enabledAMs.length > 0) {
    const accessible = enabledAMs.filter((am) => {
      if (!virtualKey.allowedModels?.length) return true;
      return virtualKey.allowedModels.includes(am.name);
    });

    // 批量查询每个接入模型对应的 group capabilities
    const amIds = accessible.map((am) => am.id);
    const capRows = amIds.length > 0 ? await db
      .select({
        amId: sql<string>`unnest(${modelRoutes.accessModelIds})`,
        capabilities: modelGroups.capabilities,
      })
      .from(modelRoutes)
      .innerJoin(
        modelGroups,
        and(
          eq(modelGroups.id, sql`(${modelRoutes.action}->>'targetId')::uuid`),
          eq(modelGroups.enabled, true),
        ),
      )
      .where(
        and(
          sql`${modelRoutes.accessModelIds} && ARRAY[${sql.join(amIds.map(id => sql`${id}`), sql`, `)}]::text[]`,
          eq(modelRoutes.enabled, true),
          sql`${modelRoutes.action}->>'type' = 'route_to_group'`,
        ),
      ) : [];

    // 按 amId 分组，合并 capabilities（bool 取 OR，数值取 MAX）
    const capMap = new Map<string, ModelCapabilities>();
    for (const row of capRows) {
      const cap = row.capabilities as Record<string, unknown> | null;
      if (!cap) continue;
      const existing = capMap.get(row.amId);
      if (!existing) {
        capMap.set(row.amId, {
          streaming: Boolean(cap.streaming),
          functionCalling: Boolean(cap.functionCalling),
          vision: Boolean(cap.vision),
          jsonMode: Boolean(cap.jsonMode),
          reasoning: Boolean(cap.reasoning),
          contextWindow: Number(cap.contextWindow ?? cap.context_window ?? 0),
          maxOutputTokens: Number(cap.maxOutputTokens ?? cap.max_output_tokens ?? cap.maxTokens ?? 0),
        });
      } else {
        existing.streaming = existing.streaming || Boolean(cap.streaming);
        existing.functionCalling = existing.functionCalling || Boolean(cap.functionCalling);
        existing.vision = existing.vision || Boolean(cap.vision);
        existing.jsonMode = existing.jsonMode || Boolean(cap.jsonMode);
        existing.reasoning = existing.reasoning || Boolean(cap.reasoning);
        existing.contextWindow = Math.max(existing.contextWindow, Number(cap.contextWindow ?? cap.context_window ?? 0));
        existing.maxOutputTokens = Math.max(existing.maxOutputTokens, Number(cap.maxOutputTokens ?? cap.max_output_tokens ?? cap.maxTokens ?? 0));
      }
    }

    return accessible.map((am) => {
      const ownCap = am.capabilities as Record<string, unknown> | null;
      if (ownCap) {
        return {
          name: am.name,
          displayName: am.displayName,
          createdAt: am.createdAt,
          capabilities: {
            streaming: Boolean(ownCap.streaming),
            functionCalling: Boolean(ownCap.functionCalling),
            vision: Boolean(ownCap.vision),
            jsonMode: Boolean(ownCap.jsonMode),
            reasoning: Boolean(ownCap.reasoning),
            contextWindow: Number(ownCap.contextWindow ?? 0),
            maxOutputTokens: Number(ownCap.maxOutputTokens ?? ownCap.maxTokens ?? 0),
          },
        };
      }
      return {
        name: am.name,
        displayName: am.displayName,
        createdAt: am.createdAt,
        capabilities: capMap.get(am.id) ?? null,
      };
    });
  }

  const allGroups = await db
    .select({
      name: modelGroups.name,
      displayName: modelGroups.displayName,
      createdAt: modelGroups.createdAt,
      capabilities: modelGroups.capabilities,
    })
    .from(modelGroups)
    .where(eq(modelGroups.enabled, true));

  return allGroups
    .filter((group) => {
      if (!virtualKey.allowedModels?.length) return true;
      return virtualKey.allowedModels.includes(group.name);
    })
    .map((group) => {
      const cap = group.capabilities as Record<string, unknown> | null;
      return {
        name: group.name,
        displayName: group.displayName,
        createdAt: group.createdAt,
        capabilities: cap ? {
          streaming: Boolean(cap.streaming),
          functionCalling: Boolean(cap.functionCalling),
          vision: Boolean(cap.vision),
          jsonMode: Boolean(cap.jsonMode),
          reasoning: Boolean(cap.reasoning),
          contextWindow: Number(cap.contextWindow ?? cap.context_window ?? 0),
          maxOutputTokens: Number(cap.maxOutputTokens ?? cap.max_output_tokens ?? cap.maxTokens ?? 0),
        } : null,
      };
    });
}
