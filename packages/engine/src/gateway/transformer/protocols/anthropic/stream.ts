import type { TransformerContext, StreamChunk, StandardMessage } from '@x-llm-gateway/shared';

import { mapToAnthropicStopReason } from './response-egress';
import { mapAnthropicFinishReason } from './response-ingress';
import { sanitizeContent } from './sanitize';
import type { AnthropicStreamEvent, AnthropicResponse, AnthropicContentBlock } from './types';

export function convertStreamEventToChunk(event: AnthropicStreamEvent): StreamChunk | null {
  switch (event.type) {
    case 'message_start':
      return {
        id: event.message?.id || '', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: event.message?.model || '',
        choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }],
        usage: event.message?.usage ? { prompt_tokens: event.message.usage.input_tokens, completion_tokens: 0, total_tokens: event.message.usage.input_tokens } : undefined,
      };
    case 'content_block_start':
      if (event.content_block?.type === 'tool_use') {
        return {
          id: '', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: '',
          choices: [{ index: event.index || 0, delta: { tool_calls: [{ index: event.index || 0, id: event.content_block.id, type: 'function', function: { name: event.content_block.name || '', arguments: '' } }] }, finish_reason: null }],
        };
      }
      return null;
    case 'content_block_delta':
      if (event.delta?.type === 'text_delta') {
        const cleanedText = event.delta.text ? sanitizeContent(event.delta.text) : '';
        if (!cleanedText) return null;
        return { id: '', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: '', choices: [{ index: event.index || 0, delta: { content: cleanedText }, finish_reason: null }] };
      }
      if (event.delta?.type === 'thinking_delta' || event.delta?.type === 'thinking') {
        const cleanedThinking = event.delta.thinking ? sanitizeContent(event.delta.thinking) : '';
        if (!cleanedThinking) return null;
        return { id: '', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: '', choices: [{ index: event.index || 0, delta: { reasoning_content: cleanedThinking }, finish_reason: null }] };
      }
      if (event.delta?.type === 'input_json_delta') {
        return {
          id: '', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: '',
          choices: [{ index: event.index || 0, delta: { tool_calls: [{ index: event.index || 0, function: { arguments: event.delta.partial_json } }] }, finish_reason: null }],
        };
      }
      return null;
    case 'message_delta':
      return {
        id: '', object: 'chat.completion.chunk', created: Math.floor(Date.now() / 1000), model: '',
        choices: [{ index: 0, delta: {}, finish_reason: mapAnthropicFinishReason(event.delta?.stop_reason ?? null) }],
        usage: event.usage ? { prompt_tokens: 0, completion_tokens: event.usage.output_tokens, total_tokens: event.usage.output_tokens } : undefined,
      };
    case 'content_block_stop':
    case 'message_stop':
      return null;
    default:
      return null;
  }
}

export function normalizeAnthropicStream(stream: ReadableStream, ctx: TransformerContext): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    start: async (controller) => {
      const reader = stream.getReader();
      let buffer = '';
      let currentEvent: string | null = null;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            const trimmedLine = line.trim();
            if (trimmedLine === '') { currentEvent = null; continue; }
            if (trimmedLine.startsWith('event: ')) { currentEvent = trimmedLine.slice(7).trim(); continue; }
            if (trimmedLine.startsWith('data: ')) {
              const data = trimmedLine.slice(6);
              try {
                const eventData: AnthropicStreamEvent = JSON.parse(data);
                if (currentEvent) eventData.type = currentEvent as AnthropicStreamEvent['type'];
                const converted = convertStreamEventToChunk(eventData);
                if (converted) controller.enqueue(encoder.encode(`data: ${JSON.stringify(converted)}\n\n`));
              } catch { /* skip */ }
            }
          }
        }
        controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      } catch (error) {
        controller.error(error);
        return; // Exit before finally to avoid double-close
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

export function adaptStreamToAnthropic(stream: ReadableStream, ctx: TransformerContext): ReadableStream {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  return new ReadableStream({
    start: async (controller) => {
      const reader = stream.getReader();
      let buffer = '';
      const messageId = `msg_${crypto.randomUUID()}`;
      let sentMessageStart = false;
      let sentThinkingStart = false;
      let sentContentStart = false;
      const thinkingBlockIndex = 0;
      const textBlockIndex = 1;
      const toolCallsMap = new Map<number, { id?: string; name?: string; arguments: string }>();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (data === '[DONE]') {
              controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({ type: 'message_stop' })}\n\n`));
              continue;
            }

            try {
              const chunk = JSON.parse(data) as StreamChunk;
              const delta = chunk.choices[0]?.delta;

              if (!sentMessageStart) {
                controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({ type: 'message_start', message: { id: messageId, type: 'message', role: 'assistant', content: [], model: chunk.model || '', usage: { input_tokens: chunk.usage?.prompt_tokens || 0, output_tokens: 0 } } })}\n\n`));
                sentMessageStart = true;
              }

              if (delta?.reasoning_content) {
                if (!sentThinkingStart) {
                  controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: thinkingBlockIndex, content_block: { type: 'thinking', thinking: '' } })}\n\n`));
                  sentThinkingStart = true;
                }
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: thinkingBlockIndex, delta: { type: 'thinking_delta', thinking: delta.reasoning_content } })}\n\n`));
              }

              if (delta?.content) {
                if (sentThinkingStart && !sentContentStart) {
                  controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index: thinkingBlockIndex })}\n\n`));
                }
                if (!sentContentStart) {
                  controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: textBlockIndex, content_block: { type: 'text', text: '' } })}\n\n`));
                  sentContentStart = true;
                }
                controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: textBlockIndex, delta: { type: 'text_delta', text: delta.content } })}\n\n`));
              }

              if (delta?.tool_calls) {
                for (const toolCall of delta.tool_calls) {
                  const originalIndex = toolCall.index || 0;
                  const toolIndex = originalIndex + 2;
                  let existingCall = toolCallsMap.get(originalIndex);
                  if (!existingCall) { existingCall = { arguments: '' }; toolCallsMap.set(originalIndex, existingCall); }

                  if (toolCall.id) {
                    existingCall.id = toolCall.id;
                    existingCall.name = toolCall.function?.name || '';
                    controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({ type: 'content_block_start', index: toolIndex, content_block: { type: 'tool_use', id: toolCall.id, name: existingCall.name } })}\n\n`));
                  }
                  if (toolCall.function?.arguments) {
                    existingCall.arguments += toolCall.function.arguments;
                    controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({ type: 'content_block_delta', index: toolIndex, delta: { type: 'input_json_delta', partial_json: toolCall.function.arguments } })}\n\n`));
                  }
                }
              }

              if (chunk.choices[0]?.finish_reason) {
                const blocksToClose: number[] = [];
                if (sentThinkingStart) blocksToClose.push(thinkingBlockIndex);
                if (sentContentStart) blocksToClose.push(textBlockIndex);
                toolCallsMap.forEach((_, originalIndex) => { blocksToClose.push(originalIndex + 2); });
                for (const index of blocksToClose) controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({ type: 'content_block_stop', index })}\n\n`));
                controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({ type: 'message_delta', delta: { stop_reason: mapToAnthropicStopReason(chunk.choices[0].finish_reason) }, usage: { output_tokens: chunk.usage?.completion_tokens || 0 } })}\n\n`));
              }
            } catch { /* skip */ }
          }
        }
      } catch (error) {
        controller.error(error);
        return;
      } finally {
        reader.releaseLock();
        controller.close();
      }
    },
  });
}

export function transformAnthropicStream(stream: ReadableStream, ctx: TransformerContext): ReadableStream {
  const direction = ctx.state.get('streamDirection') as 'normalize' | 'adapt' | undefined;
  if (direction === 'adapt') return adaptStreamToAnthropic(stream, ctx);
  return normalizeAnthropicStream(stream, ctx);
}
