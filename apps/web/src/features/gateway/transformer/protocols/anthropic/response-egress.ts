import type { TransformerContext, StandardResponse } from '@/types';

import type { AnthropicContentBlock, AnthropicResponse } from './types';

export function mapToAnthropicStopReason(reason: string | null): AnthropicResponse['stop_reason'] {
  if (!reason) return null;
  switch (reason) {
    case 'stop': return 'end_turn';
    case 'length': return 'max_tokens';
    case 'tool_calls': return 'tool_use';
    case 'content_filter': return 'stop_sequence';
    default: return null;
  }
}

export async function adaptAnthropicResponse(
  response: StandardResponse,
  ctx: TransformerContext,
): Promise<Response> {
  const choice = response.choices?.[0];
  if (!choice) throw new Error('No choices in response');

  const content: AnthropicContentBlock[] = [];
  if (choice.message?.reasoning_content) content.push({ type: 'thinking', thinking: choice.message.reasoning_content });
  if (choice.message?.content) {
    const text = typeof choice.message.content === 'string' ? choice.message.content : '';
    if (text) content.push({ type: 'text', text });
  }
  if (choice.message?.tool_calls) {
    for (const tc of choice.message.tool_calls) {
      content.push({ type: 'tool_use', id: tc.id, name: tc.function.name, input: JSON.parse(tc.function.arguments || '{}') });
    }
  }

  const anthropicResponse: AnthropicResponse = {
    id: response.id, type: 'message', role: 'assistant', model: response.model,
    content, stop_reason: mapToAnthropicStopReason(choice.finish_reason), stop_sequence: null,
    usage: { input_tokens: response.usage?.prompt_tokens || 0, output_tokens: response.usage?.completion_tokens || 0 },
  };

  return new Response(JSON.stringify(anthropicResponse), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
