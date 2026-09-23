import type { InstanceConfig } from './model-group'

export interface AgentExecution {
  runtime: 'pi'
  status: 'completed' | 'max_turns' | 'aborted' | 'error'
  turns: number
}

export interface InstanceAgentResponse {
  explanation: string
  previousConfig: InstanceConfig | null
  newConfig: InstanceConfig
  instanceName: string
  execution: AgentExecution
}
