import logger from '../../../../../lib/logger'
import type { ToolCall } from '@xartifact/x-herald-shared'

import { parseToolArguments } from '../../../shared/tool-arguments-parser'

export function normalizeToolCalls(
  toolCalls: Array<{
    id: string
    type: 'function'
    function: {
      name: string
      arguments: string | unknown
    }
  }>,
): ToolCall[] {
  if (!toolCalls) return []

  return toolCalls.map((tc) => {
    let argsString: string
    if (typeof tc.function.arguments === 'string') {
      argsString = tc.function.arguments
    } else {
      argsString = JSON.stringify(tc.function.arguments)
    }
    const validatedArgs = parseToolArguments(argsString, logger)

    return {
      id: tc.id,
      type: tc.type,
      function: {
        name: tc.function.name,
        arguments: validatedArgs,
      },
    }
  })
}
