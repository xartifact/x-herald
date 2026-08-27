/**
 * omp model-role mapping for x-herald virtual models.
 *
 * omp's `modelRoles` (config.yml) decides which model each role resolves to
 * (`smol`, `slow`, `plan`, …), and a `:xhigh` suffix pins the thinking level.
 * The omp extension API has no write access to `modelRoles`, so this module
 * only *renders* a ready-to-paste config.yml fragment against the live gateway
 * catalogue — the `/x-herald setup` command surfaces it as a widget.
 *
 * Pure logic, no runtime-specific code (Node + Bun identical output).
 */

import type { GatewayModelEntry } from './types.ts'

/** Provider prefix prepended to every role value. */
export const PROVIDER_PREFIX = 'x-herald'

/** Thinking-level suffix applied to every role value ("所有模型默认启用 xhigh"). */
export const DEFAULT_THINKING_SUFFIX = 'xhigh'

/**
 * Ordered candidate model ids per role. First id present in the live catalogue
 * wins; a role with no candidate present is reported as unresolved.
 *
 * Keys are omp's built-in roles; values are gateway virtual-model ids. Roles
 * the spec says "reuse smol" (commit/tiny) point at smol's candidate set so a
 * single catalogue drives both.
 */
export const ROLE_TO_MODEL_CANDIDATES: Record<string, string[]> = {
  // Fast/轻量 → 探索者（轻量探测）
  smol: ['Explorer'],
  // Thinking/强推理 → 架构师（同耗慢链）；Plan 已让给 plan 角色,Architect 与 Plan 都是强推理虚拟模型
  slow: ['Architect'],
  // Vision/视觉 → 设计师（UI/视觉质量高的 Gemini Pro 系）
  vision: ['Designer'],
  // Architect/架构规划 → Plan
  plan: ['Plan'],
  // Designer/UI 设计 → Designer
  designer: ['Designer'],
  // Commit → 复用 smol(快);omp 按 commit→smol→… 顺序解析 commit 消息
  commit: ['Explorer'],
  // Tiny/极小成本(标题/记忆/难度分类器)→ 复用 smol 同款快模型
  tiny: ['Explorer'],
  // Subtask/子代理 → Plan(需要深入分析)
  task: ['Plan'],
  // Advisor/独立第二意见 → 领域专家(既是独立强模型,又不与 slow 用的 Architect 撞车)
  advisor: ['DomainExpert'],
  // Default/主会话通用默认 → Plan
  default: ['Plan'],
}

export interface RoleResolution {
  role: string
  modelId: string
}

/** Resolve each role to its first available candidate model id (catalogue order preserved). */
export function resolveRoleModels(entries: GatewayModelEntry[]): Map<string, string> {
  const available = new Set(entries.map((e) => e.id))
  const resolved = new Map<string, string>()
  for (const [role, candidates] of Object.entries(ROLE_TO_MODEL_CANDIDATES)) {
    const hit = candidates.find((id) => available.has(id))
    if (hit) resolved.set(role, hit)
  }
  return resolved
}

function yamlQuote(value: string): string {
  // Conservative: quote anything that YAML would parse as a non-plain scalar
  // (colons in `provider/model:level` are fine unquoted, but JSON-ish or
  // leading-special tokens are not).
  return /^[A-Za-z0-9._/:@-]+$/.test(value) ? value : JSON.stringify(value)
}

export interface RoleConfigSnippet {
  /** `role: x-herald/Model:xhigh` pairs, ordered by omp's canonical role order. */
  lines: string[]
  /** Roles that resolved to a concrete model. */
  resolved: RoleResolution[]
  /** Roles whose candidate models are missing from the catalogue. */
  unresolved: string[]
}

const CANONICAL_ROLE_ORDER = [
  'default',
  'smol',
  'slow',
  'vision',
  'plan',
  'designer',
  'commit',
  'tiny',
  'task',
  'advisor',
]

/** Build a ready-to-paste `modelRoles:` YAML fragment from the live catalogue. */
export function buildRoleConfigSnippet(entries: GatewayModelEntry[]): RoleConfigSnippet {
  const resolved = resolveRoleModels(entries)
  const ordered = CANONICAL_ROLE_ORDER.filter((role) => resolved.has(role))
  const lines = ordered.map((role) => {
    const modelId = resolved.get(role)!
    return `  ${role}: ${yamlQuote(`${PROVIDER_PREFIX}/${modelId}:${DEFAULT_THINKING_SUFFIX}`)}`
  })
  const unresolved = CANONICAL_ROLE_ORDER.filter((role) => !resolved.has(role))
  return {
    lines,
    resolved: ordered.map((role) => ({ role, modelId: resolved.get(role)! })),
    unresolved,
  }
}

/** Compact widget header: resolved/missing count. */
export function roleSnippetSummary(snippet: RoleConfigSnippet): { head: string; tail: string[] } {
  const total = CANONICAL_ROLE_ORDER.length
  const head = `modelRoles — ${PROVIDER_PREFIX}/*:${DEFAULT_THINKING_SUFFIX} (${snippet.resolved.length}/${total} roles mapped)`
  const tail: string[] = []
  if (snippet.unresolved.length > 0) {
    tail.push('', '⚠ missing from catalogue: ' + snippet.unresolved.join(', '))
    tail.push('  roles stay unconfigured until the model appears in /v1/models')
  }
  tail.push('', 'paste under ~/.omp/agent/config.yml:')
  return { head, tail }
}
