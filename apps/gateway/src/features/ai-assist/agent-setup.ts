import { Agent } from '@xartifact/x-llm-gateway-sdk'
import { errorDiagnosisSkill, configGenerationSkill } from '@xartifact/x-llm-gateway-sdk'

import { createLLMAdapter } from '../../lib/llm-adapter'
import { allExecutors } from './tool-executors'

let agentInstance: Agent | null = null

export function getAgent(): Agent {
  if (!agentInstance) {
    agentInstance = new Agent(createLLMAdapter())

    // Register all tool executors
    for (const executor of allExecutors) {
      agentInstance.registerExecutor(executor)
    }

    // Register skills
    agentInstance.registerSkill(errorDiagnosisSkill)
    agentInstance.registerSkill(configGenerationSkill)
  }

  return agentInstance
}
