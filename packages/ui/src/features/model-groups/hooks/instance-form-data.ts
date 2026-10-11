import type { InstanceFormData, ModelInstance } from '@xartifact/x-herald-shared'

export function instanceToForm(instance?: ModelInstance): InstanceFormData {
  return {
    providerId: instance?.providerId ?? '',
    name: instance?.name ?? '',
    actualModelName: instance?.actualModelName ?? '',
    description: instance?.description ?? '',
    weight: instance?.weight ?? 100,
    groupIds: instance?.groupIds ?? [],
    config: instance?.config ?? undefined,
    costPer1kTokens: {
      input: 0,
      output: 0,
      ...instance?.costPer1kTokens,
      _enabled: !!instance?.costPer1kTokens,
    },
  }
}

export function instanceFormToPayload(data: InstanceFormData) {
  const { _enabled, ...cost } = data.costPer1kTokens ?? { _enabled: false, input: 0, output: 0 }
  return {
    providerId: data.providerId,
    name: data.name.trim(),
    actualModelName: data.actualModelName.trim(),
    description: data.description,
    weight: data.weight,
    groupIds: data.groupIds ?? [],
    config: data.config,
    costPer1kTokens: _enabled ? cost : null,
  }
}
