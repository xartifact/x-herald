export interface RouteCondition {
  field: string
  operator: 'eq' | 'ne' | 'in' | 'starts_with' | 'exists'
  value?: unknown
}

export interface RouteAction {
  type: 'route_to_virtual_model' | 'route_to_group' | 'route_to_instance' | 'reject' | 'fallback'
  targetId?: string
  reason?: string
}

export interface FlowNodeData {
  id: string
  type: string
  position: { x: number; y: number }
  data: Record<string, unknown>
}

export interface FlowEdgeData {
  id: string
  source: string
  target: string
  sourceHandle?: string
  targetHandle?: string
}

export interface FlowData {
  nodes: FlowNodeData[]
  edges: FlowEdgeData[]
}

export interface ModelRoute {
  id: string
  name: string
  description: string | null
  virtualModelIds: string[]
  conditions: RouteCondition[]
  action: RouteAction
  priority: number
  enabled: boolean
  flowData: FlowData | null
  createdAt: string
  updatedAt: string
  virtualModel?: {
    name: string
    displayName: string | null
  } | null
}

export interface CreateModelRoutePayload {
  name: string
  description?: string
  virtualModelIds?: string[]
  conditions?: RouteCondition[]
  action: RouteAction
  priority?: number
  enabled?: boolean
  flowData?: FlowData
}

export interface UpdateModelRoutePayload {
  name?: string
  description?: string
  virtualModelIds?: string[] | null
  conditions?: RouteCondition[]
  action?: RouteAction
  priority?: number
  enabled?: boolean
  flowData?: FlowData | null
}

export interface SyncResult {
  updatedRoutes: string[]
  newRoutes?: string[]
  deletedRoutes?: string[]
}
