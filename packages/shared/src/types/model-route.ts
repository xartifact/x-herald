export interface RouteCondition {
  field: string
  operator: 'eq' | 'ne' | 'in' | 'starts_with' | 'exists' | 'gt' | 'lt' | 'gte' | 'lte'
  value?: unknown
}

export interface RouteAction {
  type: 'route_to_virtual_model' | 'route_to_group' | 'route_to_instance' | 'reject' | 'fallback'
  targetId?: string
  reason?: string
}

export interface SyncResult {
  updatedRoutes: string[]
  newRoutes?: string[]
  deletedRoutes?: string[]
}
