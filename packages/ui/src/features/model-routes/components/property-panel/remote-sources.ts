import { useMemo } from 'react'

import { CATCHALL_VM_NAME } from '@xartifact/x-llm-gateway-shared'

import { useAccessModels } from '../../../access-models/hooks/use-access-models'
import { useModelGroups, useModelInstances } from '../../../model-groups/hooks/use-model-groups'
import { useProviders } from '../../../providers/hooks/use-providers'

// ── Types ───────────────────────────────────────────────────────────

export type RemoteSourceName = 'model-groups' | 'model-instances' | 'access-models' | 'providers'

export interface RemoteSourceContext {
  /** 依赖字段的值，用于级联过滤 */
  [key: string]: string | undefined
}

export interface RemoteOption {
  value: string
  label: string
  /** 可选：原始数据，用于搜索匹配 */
  searchText?: string
}

export interface RemoteSourceResult {
  options: RemoteOption[]
  loading: boolean
  total: number
}

export interface RemoteFetchOptions {
  /** 客户端搜索关键字 */
  search?: string
  /** 是否启用懒加载（客户端分页） */
  lazy?: boolean
  /** 懒加载每页大小 */
  pageSize?: number
}

// ── Label resolvers ─────────────────────────────────────────────────

function groupLabel(g: { id: string; name: string; displayName?: string | null }): RemoteOption {
  return { value: g.id, label: g.displayName || g.name }
}

function instanceLabel(i: {
  id: string
  name: string
  actualModelName?: string
  providerId?: string
  provider?: { name: string }
}): RemoteOption {
  // 显示格式：provider - name (actualModelName)
  // 例如：openai - gpt-4 (gpt-4-turbo-2024-04-09)
  const provider = i.provider?.name ?? i.providerId ?? ''
  const parts: string[] = []
  if (provider) parts.push(provider)
  parts.push(i.name)
  if (i.actualModelName && i.actualModelName !== i.name) {
    parts.push(`(${i.actualModelName})`)
  }
  const base = parts.join(' - ')
  // value 必须用 actual_model_name（发给上游 LLM 的真实 model 名字）。
  // 历史 bug：早期实现用 i.id (UUID) 作 value，导致上游收到 UUID → 400。
  // 后端 route-rule-engine 现在有运行时 resolver 防御性兜底，但前端正确
  // 保存 actualModelName 仍是首选 —— 这样日志能直接看到正确的 model 名。
  const value = i.actualModelName ?? i.name
  return { value, label: base, searchText: base.toLowerCase() }
}

function accessModelLabel(m: {
  id: string
  name: string
  displayName?: string | null
}): RemoteOption {
  const base = m.displayName || m.name
  const label = m.name === CATCHALL_VM_NAME ? `★ 兜底 · ${base}` : base
  return { value: m.id, label }
}

function providerLabel(p: { id: string; name: string }): RemoteOption {
  return { value: p.id, label: p.name }
}

// ── Utils ───────────────────────────────────────────────────────────

function filterBySearch(options: RemoteOption[], search: string | undefined): RemoteOption[] {
  if (!search) return options
  const needle = search.toLowerCase()
  return options.filter((o) => {
    if (o.searchText) return o.searchText.includes(needle)
    return o.label.toLowerCase().includes(needle)
  })
}

function applyLazy(
  options: RemoteOption[],
  lazy: boolean | undefined,
  pageSize: number | undefined,
): RemoteOption[] {
  if (!lazy) return options
  return options.slice(0, pageSize ?? 50)
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * 从 RemoteSourceContext 读取依赖字段的值。
 */
export function buildRemoteContext(
  formData: Record<string, unknown> | undefined,
  filterParams?: Record<string, string>,
): RemoteSourceContext {
  const ctx: RemoteSourceContext = {}
  if (!filterParams || !formData) return ctx
  for (const [ctxKey, fieldPath] of Object.entries(filterParams)) {
    const value = getNestedValue(formData, fieldPath)
    ctx[ctxKey] = typeof value === 'string' ? value : undefined
  }
  return ctx
}

export function getDependsOnValue(
  formData: Record<string, unknown> | undefined,
  dependsOn: string,
): string | undefined {
  if (!formData) return undefined
  const value = getNestedValue(formData, dependsOn)
  return typeof value === 'string' ? value : undefined
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.')
  let current: unknown = obj
  for (const part of parts) {
    if (current == null || typeof current !== 'object') return undefined
    current = (current as Record<string, unknown>)[part]
  }
  return current
}

// ── UiSchema options type (re-exported for schema files) ────────────

export interface RemoteSelectOptions {
  /** 静态枚举（优先级最高，有值时不触发远程请求）*/
  enumOptions?: RemoteOption[]
  /** 单一远程数据源 */
  remoteSource?: RemoteSourceName
  /** 依赖字段名（支持点号嵌套路径），读取 formContext.formData[dependsOn] */
  dependsOn?: string
  /** 依赖字段值 → 远程数据源名映射（多源联动）*/
  remoteSourceMap?: Record<string, RemoteSourceName>
  /** 过滤参数: { 上下文key: 依赖字段名 } */
  filterParams?: Record<string, string>
  /** placeholder */
  placeholder?: string
  /** 是否显示清除选项，默认 true */
  allowClear?: boolean
  /** 启用远程搜索（在 SelectContent 顶部渲染搜索 Input） */
  searchable?: boolean
  /** 启用懒加载（分页） */
  lazy?: boolean
  /** 懒加载每页大小，默认 50 */
  pageSize?: number
  /** 当选项为空时的提示文案 */
  emptyHint?: string
}

// ── Core: resolve source name + context from options ────────────────

export function resolveSourceFromOptions(
  opts: RemoteSelectOptions,
  formData: Record<string, unknown> | undefined,
): { source: RemoteSourceName | undefined; ctx: RemoteSourceContext } {
  let source: RemoteSourceName | undefined
  if (opts.remoteSource) {
    source = opts.remoteSource
  } else if (opts.remoteSourceMap && opts.dependsOn) {
    const depValue = getDependsOnValue(formData, opts.dependsOn)
    source = depValue ? opts.remoteSourceMap[depValue] : undefined
  }
  const ctx = buildRemoteContext(formData, opts.filterParams)
  return { source, ctx }
}

// ── React hook: ALL hooks called unconditionally ─────────────────────
//
// 关键设计：每个渲染都调用全部 4 个 TanStack Query hooks，
// 然后根据 resolved source 选择对应的结果。这避免 React hooks 规则
// 违规（条件调用 hooks 会导致 hook 状态不一致，下拉为空等 bug）。

export function useRemoteOptions(
  opts: RemoteSelectOptions,
  formData: Record<string, unknown> | undefined,
  fetchOpts: RemoteFetchOptions = {},
): { options: RemoteOption[]; loading: boolean; total: number } {
  // 1) 所有 hooks 无条件调用（React hooks rules）
  const groupsQ = useModelGroups()
  const instancesQ = useModelInstances()
  const accessModelsQ = useAccessModels()
  const providersQ = useProviders()

  // 2) 解析数据源名 + 级联上下文
  const { source, ctx } = useMemo(() => resolveSourceFromOptions(opts, formData), [opts, formData])

  // 3) 根据 source 选择对应的原始数据
  let rawOptions: RemoteOption[] = []
  let loading = false

  if (source === 'model-groups') {
    rawOptions = (groupsQ.data ?? []).map(groupLabel)
    loading = groupsQ.isLoading
  } else if (source === 'model-instances') {
    const providerId = ctx.providerId
    const instances = instancesQ.data ?? []
    const filtered = providerId ? instances.filter((i) => i.providerId === providerId) : instances
    rawOptions = filtered.map(instanceLabel)
    loading = instancesQ.isLoading
  } else if (source === 'access-models') {
    const sorted = (accessModelsQ.data ?? []).toSorted((a, b) => {
      const aIsCatchall = a.name === CATCHALL_VM_NAME ? 0 : 1
      const bIsCatchall = b.name === CATCHALL_VM_NAME ? 0 : 1
      return aIsCatchall - bIsCatchall
    })
    rawOptions = sorted.map(accessModelLabel)
    loading = accessModelsQ.isLoading
  } else if (source === 'providers') {
    rawOptions = (providersQ.data ?? []).map(providerLabel)
    loading = providersQ.isLoading
  }

  // 4) 应用客户端搜索过滤（在懒加载之前过滤，避免切页后搜索丢失）
  const searched = filterBySearch(rawOptions, fetchOpts.search)

  // 5) 应用懒加载（分页）
  const visible = applyLazy(searched, fetchOpts.lazy, fetchOpts.pageSize)

  // 6) 静态 enumOptions 优先级最高
  const finalOptions = opts.enumOptions ?? visible

  return {
    options: finalOptions,
    loading: opts.enumOptions ? false : loading,
    total: opts.enumOptions ? finalOptions.length : searched.length,
  }
}
