import { useCallback } from 'react'

import type { CanvasGraph } from '@xartifact/x-herald-shared'

import {
  useActivateRouteRuleVersion,
  useSaveRouteRuleDraft,
  type RouteRuleVersion,
} from './use-route-rule-versions'

export interface UseRouteRuleGraphPersistenceOptions {
  accessModelId: string
}

/**
 * 路由规则图持久化命令层 —— **无状态**。
 *
 * 本 hook 不持有 graph / dirty / pending 等任何状态。状态机的所有权在
 * useRouteRuleEditor 的 useReducer 里（见 DocumentState / documentReducer）。
 * 这里只暴露两个命令：persistDraft（保存为新未激活版本）/ flush（保存并激活）。
 * 持久化成功的 graph 由调用方派发 PERSISTED 写回 reducer。
 *
 * 这种拆分的收益：
 *  - 状态唯一来源在 reducer，pendingRef / editedRef 等手写 ref 全部消失
 *  - 命令层易于测试（不依赖 React 状态语义）
 *  - 异步保存闭包不再需要 ref 防 stale，因为 graph 始终由调用方显式传入
 */
export function useRouteRuleGraphPersistence(options: UseRouteRuleGraphPersistenceOptions) {
  const { accessModelId } = options
  const saveDraft = useSaveRouteRuleDraft(accessModelId)
  const activateVersion = useActivateRouteRuleVersion(accessModelId)

  const persistDraft = useCallback(
    (graph: CanvasGraph): Promise<RouteRuleVersion> => saveDraft.mutateAsync({ graph }),
    [saveDraft],
  )

  const flush = useCallback(
    async (graph: CanvasGraph): Promise<RouteRuleVersion> => {
      const created = await saveDraft.mutateAsync({ graph })
      await activateVersion.mutateAsync(created.id)
      return created
    },

    [saveDraft, activateVersion],
  )

  return { persistDraft, flush }
}
