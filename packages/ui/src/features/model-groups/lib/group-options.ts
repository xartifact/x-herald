import type { ModelGroup } from '@xartifact/x-herald-shared'
import type { MultiSelectOption } from '../../../shared/components/multi-select'

/** 模型组的展示名规则：优先 displayName，否则回退到 name。全局唯一实现。 */
export function resolveGroupLabel(g: { name: string; displayName?: string | null }): string {
  return g.displayName || g.name
}

/** 把模型组列表转换为 MultiSelect 可用的选项，未启用的组标记为 disabled。 */
export function toGroupMultiSelectOptions(groups: ModelGroup[]): MultiSelectOption[] {
  return groups.map((g) => ({
    value: g.id,
    label: resolveGroupLabel(g),
    disabled: !g.enabled,
  }))
}
