import { useSetInstanceGroups } from '@x-llm-gateway/ui'

export {
  useModelInstances,
  useReorderInstances,
  useCreateModelInstance,
  useUpdateModelInstance,
  useDeleteModelInstance,
  useSetInstanceGroups,
  useToggleModelInstance,
} from '@x-llm-gateway/ui'
export type {
  CreateInstanceData,
  UpdateInstanceVars,
} from '@x-llm-gateway/ui'

/** @deprecated use useSetInstanceGroups */
export const useAssignInstance = useSetInstanceGroups