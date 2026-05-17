import type { LogMetadata } from '@/features/logs/db';

export function extractMessageSequence(
  requestBody?: unknown,
  standardRequestBody?: unknown,
): LogMetadata['messageSequence'] | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = (standardRequestBody || requestBody) as any;
  if (!body?.messages || !Array.isArray(body.messages)) return null;

  const messages = body.messages;
  const roles: NonNullable<LogMetadata['messageSequence']>['roles'] = [];

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  messages.forEach((msg: any, index: number) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const roleInfo: any = { role: msg.role, index: index + 1 };

    const contentTypes: string[] = [];
    if (typeof msg.content === 'string') {
      contentTypes.push('text');
    } else if (Array.isArray(msg.content)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      msg.content.forEach((part: any) => {
        if (part.type && !contentTypes.includes(part.type)) contentTypes.push(part.type);
      });
    }
    if (contentTypes.length > 0) roleInfo.contentType = contentTypes;

    let length = 0;
    if (typeof msg.content === 'string') {
      length = msg.content.length;
    } else if (Array.isArray(msg.content)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      length = msg.content.reduce((sum: number, part: any) => sum + (part.text ? part.text.length : 0), 0);
    }
    if (length > 0) roleInfo.length = length;

    if (msg.tool_calls && Array.isArray(msg.tool_calls)) roleInfo.toolCallCount = msg.tool_calls.length;
    if (msg.role === 'tool') { roleInfo.toolName = msg.name; roleInfo.toolCallId = msg.tool_call_id; }

    roles.push(roleInfo);
  });

  return { totalCount: messages.length, roles };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function detectToolCallPattern(toolCalls: any[]): 'sequential' | 'parallel' | 'single' {
  return toolCalls.length === 1 ? 'single' : 'parallel';
}

function extractToolCallsFromResponse(standardResponseBody?: unknown): LogMetadata['toolCalls'] | null {
  if (!standardResponseBody || typeof standardResponseBody !== 'object') return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = standardResponseBody as any;
  const choices = response.choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = choices[0]?.message;
  if (!message?.tool_calls || !Array.isArray(message.tool_calls) || message.tool_calls.length === 0) return null;

  const toolCalls = message.tool_calls;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tools = toolCalls.map((tc: any) => tc.function?.name).filter(Boolean);
  const pattern = detectToolCallPattern(toolCalls);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const details = toolCalls.map((tc: any, index: number) => ({
    name: tc.function?.name || 'unknown',
    arguments: tc.function?.arguments ? JSON.parse(tc.function.arguments) : undefined,
    callId: tc.id,
    source: 'response' as const,
    messageIndex: index,
  }));

  return { pattern, tools, details };
}

function extractToolResultsFromRequest(standardRequestBody?: unknown): Array<{ toolName?: string; callId?: string; result: unknown }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const body = standardRequestBody as any;
  if (!body?.messages || !Array.isArray(body.messages)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return body.messages.filter((msg: any) => msg.role === 'tool').map((msg: any) => ({ toolName: msg.name, callId: msg.tool_call_id, result: msg.content }));
}

export function extractToolCalls(
  standardRequestBody?: unknown,
  standardResponseBody?: unknown,
): LogMetadata['toolCalls'] | null {
  const toolCallsFromResponse = extractToolCallsFromResponse(standardResponseBody);
  const toolResultsFromRequest = extractToolResultsFromRequest(standardRequestBody);

  if (toolCallsFromResponse && toolResultsFromRequest.length > 0) {
    toolCallsFromResponse.details?.forEach((detail) => {
      const result = toolResultsFromRequest.find((r) => r.callId === detail.callId || r.toolName === detail.name);
      if (result) detail.result = result.result;
    });
  }

  return toolCallsFromResponse;
}
