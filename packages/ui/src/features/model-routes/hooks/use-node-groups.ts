import { useModelGroups } from '../../model-groups/hooks/use-model-groups'

/**
 * 模型组列表 Hook —— 用于流程节点属性面板
 *
 * Re-export of `useModelGroups` from the model-groups feature, scoped
 * to the model-routes feature. Shares the same TanStack Query cache key,
 * so any data already fetched by the model-groups page is reused here.
 *
 * 返回 `{ data: groups }`,其中 `groups` 为 ModelGroup 数组。
 */
export function useNodeGroups() {
  return useModelGroups()
}
