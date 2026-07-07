import { eq, and } from '@xartifact/x-llm-gateway-db'
import type { ToolExecutor } from '@xartifact/x-llm-gateway-sdk'
import { builtInTools } from '@xartifact/x-llm-gateway-sdk'

import { getDatabase } from '../../db/client'
import { requestLogs, requestAttempts } from '@xartifact/x-llm-gateway-db'
import { modelInstances } from '@xartifact/x-llm-gateway-db'

export const diagnoseErrorExecutor: ToolExecutor = {
  tool: builtInTools.diagnoseError,
  async execute(args) {
    const db = getDatabase()
    const logRows = await db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.id, args.logId as string))
      .limit(1)

    const attemptRows = await db
      .select()
      .from(requestAttempts)
      .where(
        and(
          eq(requestAttempts.requestLogId, args.logId as string),
          eq(requestAttempts.candidateIndex, 0),
        ),
      )
      .limit(1)

    const log = logRows[0]
    const attempt = attemptRows[0]

    return {
      statusCode: log?.statusCode,
      errorMessage: log?.errorMessage,
      errorType: log?.errorType,
      provider: log?.providerName,
      model: log?.modelName,
      requestBody: log?.requestBody,
      providerResponseBody: attempt?.providerResponseBody,
      instanceId:
        attempt?.instanceId ??
        (log?.metadata as { routing?: { instanceId?: string } } | null)?.routing?.instanceId,
    }
  },
}

export const applyFixExecutor: ToolExecutor = {
  tool: builtInTools.applyFix,
  async execute(args) {
    const db = getDatabase()
    const instanceRows = await db
      .select()
      .from(modelInstances)
      .where(eq(modelInstances.id, args.instanceId as string))
      .limit(1)

    if (!instanceRows.length) {
      throw new Error('Instance not found')
    }

    const currentConfig = (instanceRows[0].config as Record<string, unknown> | null) ?? {}
    const newConfig = { ...currentConfig, ...(args.config as Record<string, unknown>) }

    await db
      .update(modelInstances)
      .set({ config: newConfig, updatedAt: new Date() })
      .where(eq(modelInstances.id, args.instanceId as string))

    return { success: true, config: newConfig }
  },
}

export const getConfigExecutor: ToolExecutor = {
  tool: builtInTools.getConfig,
  async execute(args) {
    const db = getDatabase()
    const instanceRows = await db
      .select()
      .from(modelInstances)
      .where(eq(modelInstances.id, args.instanceId as string))
      .limit(1)

    if (!instanceRows.length) {
      throw new Error('Instance not found')
    }

    return (instanceRows[0].config as Record<string, unknown> | null) ?? {}
  },
}

export const getLogExecutor: ToolExecutor = {
  tool: builtInTools.getLog,
  async execute(args) {
    const db = getDatabase()
    const logRows = await db
      .select()
      .from(requestLogs)
      .where(eq(requestLogs.id, args.logId as string))
      .limit(1)

    const attemptRows = await db
      .select()
      .from(requestAttempts)
      .where(eq(requestAttempts.requestLogId, args.logId as string))
      .limit(1)

    return { log: logRows[0] ?? null, attempt: attemptRows[0] ?? null }
  },
}

export const allExecutors = [
  diagnoseErrorExecutor,
  applyFixExecutor,
  getConfigExecutor,
  getLogExecutor,
]
