import { and, eq, inArray, isNull, ne } from '@xartifact/x-herald-db'

import { getDatabase } from '../../db/client'
import { CATCHALL_VM_NAME } from '../../features/access-models/constants'
import type { VirtualKey } from '@xartifact/x-herald-db'
import {
  modelGroups,
  accessModels,
  modelInstances,
  modelGroupMemberships,
  providers,
} from '@xartifact/x-herald-db'
import type {
  ModelCost,
  ModelCostTier,
  ModelCompat,
  ModelHeaders,
  ModelThinkingLevelMap,
  InstanceConfig,
} from '@xartifact/x-herald-shared'
import { getRouteRuleEngine } from './route-rule-engine'

export interface ModelCapabilities {
  streaming: boolean
  functionCalling: boolean
  vision: boolean
  jsonMode: boolean
  reasoning: boolean
  contextWindow: number
  maxOutputTokens: number
}

export interface AccessibleModel {
  name: string
  displayName: string | null
  createdAt: Date
  capabilities: ModelCapabilities | null
  cost: ModelCost | null
  compat: ModelCompat | null
  headers: ModelHeaders | null
  thinkingLevelMap: ModelThinkingLevelMap | null
  /** 透传路由目标实例 metadata.mediaInput（媒体输入约束，无实例配置时为 null） */
  mediaInput?: Record<string, unknown> | null
}

function normalizeTiers(raw: unknown): ModelCostTier[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const tiers: ModelCostTier[] = []
  for (const t of raw) {
    if (!t || typeof t !== 'object') continue
    const r = t as Record<string, unknown>
    if (typeof r.input_tokens_above !== 'number') continue
    if (typeof r.input !== 'number' || typeof r.output !== 'number') continue
    const tier: ModelCostTier = {
      input_tokens_above: r.input_tokens_above,
      input: r.input,
      output: r.output,
    }
    if (typeof r.cache_read === 'number') tier.cache_read = r.cache_read
    if (typeof r.cache_write === 'number') tier.cache_write = r.cache_write
    tiers.push(tier)
  }
  return tiers.length > 0 ? tiers : undefined
}

function normalizeCost(raw: unknown): ModelCost | null {
  if (!raw || typeof raw !== 'object') return null
  const c = raw as Record<string, unknown>
  if (
    typeof c.input !== 'number' ||
    typeof c.output !== 'number' ||
    typeof c.cache_read !== 'number' ||
    typeof c.cache_write !== 'number'
  ) {
    return null
  }
  const cost: ModelCost = {
    input: c.input,
    output: c.output,
    cache_read: c.cache_read,
    cache_write: c.cache_write,
  }
  const tiers = normalizeTiers(c.tiers)
  if (tiers) cost.tiers = tiers
  return cost
}

function mergeCost(into: ModelCost, from: ModelCost): void {
  into.input = Math.max(into.input, from.input)
  into.output = Math.max(into.output, from.output)
  into.cache_read = Math.max(into.cache_read, from.cache_read)
  into.cache_write = Math.max(into.cache_write, from.cache_write)
  if (from.tiers && from.tiers.length > 0) {
    into.tiers = from.tiers
  }
}

const THINKING_LEVEL_KEYS = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const

function normalizeThinkingLevelMap(raw: unknown): ModelThinkingLevelMap | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: ModelThinkingLevelMap = {}
  let hasAny = false
  for (const key of THINKING_LEVEL_KEYS) {
    const value = r[key]
    if (value === null) {
      out[key] = null
      hasAny = true
    } else if (typeof value === 'string') {
      out[key] = value
      hasAny = true
    }
  }
  return hasAny ? out : null
}

function mergeThinkingLevelMap(into: ModelThinkingLevelMap, from: ModelThinkingLevelMap): void {
  for (const key of THINKING_LEVEL_KEYS) {
    if (from[key] !== undefined) {
      into[key] = from[key] ?? null
    }
  }
}

function normalizeHeaders(raw: unknown): ModelHeaders | null {
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Record<string, unknown>
  const out: ModelHeaders = {}
  let hasAny = false
  for (const [k, v] of Object.entries(r)) {
    if (typeof v === 'string') {
      out[k] = v
      hasAny = true
    }
  }
  return hasAny ? out : null
}

const DEFAULT_COMPAT: ModelCompat = {
  supports_developer_role: true,
  supports_reasoning_effort: false,
  max_tokens_field: 'max_completion_tokens',
}

function normalizeCompat(raw: unknown, capabilities: ModelCapabilities): ModelCompat | null {
  const base: ModelCompat = {
    ...DEFAULT_COMPAT,
    supports_reasoning_effort: capabilities.reasoning,
  }
  if (!raw || typeof raw !== 'object') return base
  const c = raw as Record<string, unknown>
  const field = c.max_tokens_field === 'max_tokens' ? 'max_tokens' : 'max_completion_tokens'
  return {
    supports_developer_role:
      c.supports_developer_role !== undefined
        ? Boolean(c.supports_developer_role)
        : base.supports_developer_role,
    supports_reasoning_effort:
      c.supports_reasoning_effort !== undefined
        ? Boolean(c.supports_reasoning_effort)
        : base.supports_reasoning_effort,
    max_tokens_field: field,
  }
}

function normalizeCapabilities(cap: Record<string, unknown> | null): ModelCapabilities {
  if (!cap) {
    return {
      streaming: false,
      functionCalling: false,
      vision: false,
      jsonMode: false,
      reasoning: false,
      contextWindow: 0,
      maxOutputTokens: 0,
    }
  }
  return {
    streaming: Boolean(cap.streaming),
    functionCalling: Boolean(cap.functionCalling),
    vision: Boolean(cap.vision),
    jsonMode: Boolean(cap.jsonMode),
    reasoning: Boolean(cap.reasoning),
    contextWindow: Number(cap.contextWindow ?? cap.context_window ?? 0),
    maxOutputTokens: Number(cap.maxOutputTokens ?? cap.max_output_tokens ?? cap.maxTokens ?? 0),
  }
}

function pickPositiveNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : undefined
}

/** 从实例 metadata/config 读上游真实能力；metadata 优先（syncModels 管线规范位置） */
function readInstanceRealCaps(
  metadata: Record<string, unknown> | null | undefined,
  config: InstanceConfig | null | undefined,
): { contextWindow: number; maxOutputTokens: number; mediaInput?: Record<string, unknown> } | null {
  const meta = metadata ?? {}
  const overrides = (config?.capabilityOverrides ?? {}) as Record<string, unknown>
  const contextWindow = pickPositiveNumber(meta.contextWindow ?? overrides.contextWindow)
  const maxOutputTokens = pickPositiveNumber(meta.maxOutputTokens ?? overrides.maxTokens)
  const mediaInput =
    meta.mediaInput && typeof meta.mediaInput === 'object'
      ? (meta.mediaInput as Record<string, unknown>)
      : undefined
  if (contextWindow === undefined && maxOutputTokens === undefined && !mediaInput) return null
  return {
    contextWindow: contextWindow ?? 0,
    maxOutputTokens: maxOutputTokens ?? 0,
    ...(mediaInput && { mediaInput }),
  }
}

/** 实例真实值覆盖广播值（存储值被 1M 默认污染，实例值才是上游事实） */
function overlayRealCaps(
  capabilities: ModelCapabilities,
  real: { contextWindow: number; maxOutputTokens: number } | null,
): void {
  if (!real) return
  if (real.contextWindow > 0) capabilities.contextWindow = real.contextWindow
  if (real.maxOutputTokens > 0) capabilities.maxOutputTokens = real.maxOutputTokens
}

function mergeCapabilities(into: ModelCapabilities, from: ModelCapabilities): void {
  into.streaming = into.streaming || from.streaming
  into.functionCalling = into.functionCalling || from.functionCalling
  into.vision = into.vision || from.vision
  into.jsonMode = into.jsonMode || from.jsonMode
  into.reasoning = into.reasoning || from.reasoning
  into.contextWindow = Math.max(into.contextWindow, from.contextWindow)
  into.maxOutputTokens = Math.max(into.maxOutputTokens, from.maxOutputTokens)
}

interface ModelExtras {
  cost: ModelCost | null
  compat: ModelCompat | null
  headers: ModelHeaders | null
  thinkingLevelMap: ModelThinkingLevelMap | null
}

function buildModelExtras(
  capabilities: ModelCapabilities,
  costRaw: unknown,
  compatRaw: unknown,
  headersRaw: unknown,
  thinkingRaw: unknown,
): ModelExtras {
  return {
    cost: normalizeCost(costRaw),
    compat: normalizeCompat(compatRaw, capabilities),
    headers: normalizeHeaders(headersRaw),
    thinkingLevelMap: normalizeThinkingLevelMap(thinkingRaw),
  }
}

/**
 * 查询当前 virtualKey 有权访问的模型列表
 * 优先返回接入模型（含 capabilities），无接入模型时回退到模型组
 */
export async function fetchAccessibleModels(virtualKey: VirtualKey): Promise<AccessibleModel[]> {
  const db = getDatabase()

  const enabledAMs = await db
    .select({
      id: accessModels.id,
      name: accessModels.name,
      displayName: accessModels.displayName,
      capabilities: accessModels.capabilities,
      createdAt: accessModels.createdAt,
    })
    .from(accessModels)
    .where(
      and(
        eq(accessModels.enabled, true),
        ne(accessModels.name, CATCHALL_VM_NAME),
        isNull(accessModels.deletedAt),
      ),
    )
  if (enabledAMs.length > 0) {
    const accessible = enabledAMs.filter((am) => {
      if (!virtualKey.allowedModels?.length) return true
      return virtualKey.allowedModels.includes(am.name)
    })

    // 从 canvasStates matchers 派生 amId -> targetGroupId 映射
    const matchers = getRouteRuleEngine().getAllMatchers()
    const amToGroupIds = new Map<string, Set<string>>()
    const targetGroupIds = new Set<string>()
    for (const m of matchers) {
      if (!m.enabled) continue
      if (m.action.type !== 'route_to_group' || !m.action.targetId) continue
      targetGroupIds.add(m.action.targetId)
      for (const amId of m.accessModelIds) {
        let set = amToGroupIds.get(amId)
        if (!set) {
          set = new Set()
          amToGroupIds.set(amId, set)
        }
        set.add(m.action.targetId)
      }
    }

    // 批量取这些 group 的 capabilities + cost + compat + headers + thinking_level_map
    const groupRows =
      targetGroupIds.size > 0
        ? await db
            .select({
              id: modelGroups.id,
              capabilities: modelGroups.capabilities,
            })
            .from(modelGroups)
            .where(
              and(
                inArray(modelGroups.id, Array.from(targetGroupIds)),
                eq(modelGroups.enabled, true),
                isNull(modelGroups.deletedAt),
              ),
            )
        : []
    const groupCapMap = new Map<string, { capabilities: ModelCapabilities } & ModelExtras>()
    for (const g of groupRows) {
      const raw = g.capabilities as Record<string, unknown> | null
      const capabilities = normalizeCapabilities(raw)
      const extras = buildModelExtras(
        capabilities,
        raw?.cost,
        raw?.compat,
        raw?.headers,
        raw?.thinking_level_map ?? raw?.thinkingLevelMap,
      )
      groupCapMap.set(g.id, { capabilities, ...extras })
    }

    // 批量取目标组启用实例的 metadata/config（上游真实能力，syncModels 已写入）
    const instanceRows =
      targetGroupIds.size > 0
        ? await db
            .select({
              groupId: modelGroupMemberships.groupId,
              metadata: modelInstances.metadata,
              config: modelInstances.config,
            })
            .from(modelGroupMemberships)
            .innerJoin(modelInstances, eq(modelGroupMemberships.instanceId, modelInstances.id))
            .innerJoin(providers, eq(modelInstances.providerId, providers.id))
            .innerJoin(modelGroups, eq(modelGroupMemberships.groupId, modelGroups.id))
            .where(
              and(
                inArray(modelGroupMemberships.groupId, Array.from(targetGroupIds)),
                eq(modelInstances.enabled, true),
                isNull(modelInstances.deletedAt),
                eq(providers.enabled, true),
                isNull(providers.deletedAt),
                eq(modelGroups.enabled, true),
                isNull(modelGroups.deletedAt),
              ),
            )
        : []

    // amId → 目标组全部实例的 MAX(真实 contextWindow / maxOutputTokens)；mediaInput 取首个非空
    const realCapsByAm = new Map<
      string,
      { contextWindow: number; maxOutputTokens: number; mediaInput?: Record<string, unknown> }
    >()
    for (const [amId, groupIds] of amToGroupIds) {
      let real: {
        contextWindow: number
        maxOutputTokens: number
        mediaInput?: Record<string, unknown>
      } | null = null
      for (const row of instanceRows) {
        if (!groupIds.has(row.groupId)) continue
        const caps = readInstanceRealCaps(row.metadata, row.config)
        if (!caps) continue
        if (!real) real = { contextWindow: 0, maxOutputTokens: 0 }
        real.contextWindow = Math.max(real.contextWindow, caps.contextWindow)
        real.maxOutputTokens = Math.max(real.maxOutputTokens, caps.maxOutputTokens)
        if (!real.mediaInput && caps.mediaInput) real.mediaInput = caps.mediaInput
      }
      if (real) realCapsByAm.set(amId, real)
    }

    // 按 amId 合并 capabilities（bool 取 OR，数值取 MAX）
    const capMap = new Map<string, { capabilities: ModelCapabilities } & ModelExtras>()
    for (const [amId, gIds] of amToGroupIds) {
      let mergedCap: ModelCapabilities | null = null
      let mergedCost: ModelCost | null = null
      let mergedCompat: ModelCompat | null = null
      let mergedHeaders: ModelHeaders | null = null
      let mergedThinking: ModelThinkingLevelMap | null = null
      for (const gid of gIds) {
        const group = groupCapMap.get(gid)
        if (!group) continue
        if (!mergedCap) {
          mergedCap = { ...group.capabilities }
          mergedCost = group.cost ? { ...group.cost, tiers: [...(group.cost.tiers ?? [])] } : null
          mergedCompat = group.compat ? { ...group.compat } : null
          mergedHeaders = group.headers ? { ...group.headers } : null
          mergedThinking = group.thinkingLevelMap ? { ...group.thinkingLevelMap } : null
        } else {
          mergeCapabilities(mergedCap, group.capabilities)
          if (mergedCost && group.cost) mergeCost(mergedCost, group.cost)
          if (mergedCompat && group.compat)
            mergedCompat.supports_reasoning_effort =
              mergedCompat.supports_reasoning_effort || group.compat.supports_reasoning_effort
          if (mergedHeaders && group.headers) Object.assign(mergedHeaders, group.headers)
          if (mergedThinking && group.thinkingLevelMap)
            mergeThinkingLevelMap(mergedThinking, group.thinkingLevelMap)
        }
      }
      if (mergedCap) {
        capMap.set(amId, {
          capabilities: mergedCap,
          cost: mergedCost,
          compat: mergedCompat,
          headers: mergedHeaders,
          thinkingLevelMap: mergedThinking,
        })
      }
    }

    return accessible.map((am) => {
      const real = realCapsByAm.get(am.id)
      const ownCap = am.capabilities as Record<string, unknown> | null
      if (ownCap) {
        const capabilities = normalizeCapabilities(ownCap)
        overlayRealCaps(capabilities, real ?? null)
        const extras = buildModelExtras(
          capabilities,
          ownCap.cost,
          ownCap.compat,
          ownCap.headers,
          ownCap.thinking_level_map ?? ownCap.thinkingLevelMap,
        )
        return {
          name: am.name,
          displayName: am.displayName,
          createdAt: am.createdAt,
          capabilities,
          mediaInput: real?.mediaInput ?? null,
          ...extras,
        }
      }
      const inherited = capMap.get(am.id)
      const capabilities = inherited?.capabilities ?? null
      if (capabilities) overlayRealCaps(capabilities, real ?? null)
      return {
        name: am.name,
        displayName: am.displayName,
        createdAt: am.createdAt,
        capabilities,
        mediaInput: real?.mediaInput ?? null,
        cost: inherited?.cost ?? null,
        compat: inherited?.compat ?? null,
        headers: inherited?.headers ?? null,
        thinkingLevelMap: inherited?.thinkingLevelMap ?? null,
      }
    })
  }

  const allGroups = await db
    .select({
      name: modelGroups.name,
      displayName: modelGroups.displayName,
      createdAt: modelGroups.createdAt,
      capabilities: modelGroups.capabilities,
    })
    .from(modelGroups)
    .where(and(eq(modelGroups.enabled, true), isNull(modelGroups.deletedAt)))

  return allGroups
    .filter((group) => {
      if (!virtualKey.allowedModels?.length) return true
      return virtualKey.allowedModels.includes(group.name)
    })
    .map((group) => {
      const raw = group.capabilities as Record<string, unknown> | null
      const capabilities = normalizeCapabilities(raw)
      const extras = buildModelExtras(
        capabilities,
        raw?.cost,
        raw?.compat,
        raw?.headers,
        raw?.thinking_level_map ?? raw?.thinkingLevelMap,
      )
      return {
        name: group.name,
        displayName: group.displayName,
        createdAt: group.createdAt,
        capabilities,
        ...extras,
      }
    })
}
