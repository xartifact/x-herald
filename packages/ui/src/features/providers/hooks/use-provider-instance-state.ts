import { useMemo, useCallback } from 'react'
import { useModelGroups } from '../../model-groups/hooks/use-model-groups'
import { useGroupPageInstances } from '../../model-groups/hooks/use-group-page-instances'
import { instanceToForm } from '../../model-groups/hooks/instance-form-data'
import type { ModelInstance } from '@xartifact/x-herald-shared'

export function useProviderInstanceState() {
  const state = useGroupPageInstances()
  const { data: groups = [] } = useModelGroups()
  const instancesByProvider = useMemo(() => {
    const map = new Map<string, ModelInstance[]>()
    for (const instance of state.instances) {
      const list = map.get(instance.providerId) ?? []
      list.push(instance)
      map.set(instance.providerId, list)
    }
    return map
  }, [state.instances])
  const getGroupName = useCallback(
    (id: string | null) => {
      const group = groups.find((item) => item.id === id)
      return group?.displayName || group?.name || id || '-'
    },
    [groups],
  )
  const handleAddInstance = (providerId: string) => {
    state.handleAddInstance()
    state.instanceForm.reset({ ...instanceToForm(), providerId })
  }
  return { ...state, groups, instancesByProvider, getGroupName, handleAddInstance }
}
