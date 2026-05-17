function convertContentToChatFormat(content: unknown): string | unknown[] {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return String(content ?? '');

  const converted: Array<{ type: string; text?: string; image_url?: { url: string } }> = [];
  for (const item of content) {
    if (typeof item !== 'object' || item === null) continue;
    const contentItem = item as { type?: string; text?: string; image_url?: { url: string } };
    if (contentItem.type === 'input_text' || contentItem.type === 'output_text') {
      converted.push({ type: 'text', text: contentItem.text || '' });
    } else if (contentItem.type === 'input_image' && contentItem.image_url) {
      converted.push({ type: 'image_url', image_url: contentItem.image_url });
    } else {
      converted.push(item as { type: string });
    }
  }

  return converted.length === 1 && typeof converted[0] === 'object'
    ? (converted[0] as { text?: string }).text || converted
    : converted;
}

export function convertResponsesToChatFormat(body: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { model: body.model, stream: body.stream ?? false };

  if (Array.isArray(body.input)) {
    const messages: Array<{ role: string; content: string | unknown[] }> = [];
    if (body.instructions && typeof body.instructions === 'string') {
      messages.push({ role: 'system', content: body.instructions });
    }
    for (const item of body.input) {
      if (typeof item !== 'object' || item === null) continue;
      const inputItem = item as { role?: string; content?: unknown; type?: string; text?: string };
      if (inputItem.role) {
        const role = inputItem.role === 'assistant' ? 'assistant' : 'user';
        messages.push({ role, content: convertContentToChatFormat(inputItem.content) });
      } else if (inputItem.type === 'input_text' && inputItem.text) {
        messages.push({ role: 'user', content: inputItem.text });
      }
    }
    result.messages = messages;
  }

  if (body.max_output_tokens !== undefined) result.max_tokens = body.max_output_tokens;
  if (body.temperature !== undefined) result.temperature = body.temperature;
  if (body.top_p !== undefined) result.top_p = body.top_p;
  if (body.tools !== undefined) result.tools = body.tools;
  if (body.tool_choice !== undefined) result.tool_choice = body.tool_choice;
  if (body.stop !== undefined) result.stop = body.stop;
  if (body.stream_options !== undefined) result.stream_options = body.stream_options;

  return result;
}

export function convertChatToResponsesBody(chatBody: Record<string, unknown>): Record<string, unknown> {
  const output: Array<Record<string, unknown>> = [];

  if (chatBody.choices && Array.isArray(chatBody.choices)) {
    for (const choice of chatBody.choices) {
      const message = choice.message;
      if (!message) continue;

      const content: Array<Record<string, unknown>> = [];
      if (typeof message.content === 'string') {
        content.push({ type: 'output_text', text: message.content });
      } else if (Array.isArray(message.content)) {
        for (const item of message.content) {
          if (item.type === 'text') content.push({ type: 'output_text', text: item.text || '' });
        }
      }

      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        for (const toolCall of message.tool_calls) {
          const tc = toolCall as { id?: string; type?: string; function?: { name?: string; arguments?: string } };
          if (tc.function?.name) {
            output.push({
              type: 'function_call',
              id: tc.id || `fc_${Math.random().toString(36).slice(2, 10)}`,
              name: tc.function.name,
              args: JSON.parse(tc.function.arguments || '{}'),
            });
          }
        }
      }

      output.push({ type: 'message', role: message.role || 'assistant', content });
    }
  }

  const result: Record<string, unknown> = {
    id: (chatBody.id as string)?.replace('chatcmpl', 'resp') || `resp_${Date.now()}`,
    object: 'response',
    created_at: chatBody.created || Math.floor(Date.now() / 1000),
    model: chatBody.model,
    output,
  };

  if (chatBody.usage) {
    result.usage = {
      input_tokens: (chatBody.usage as Record<string, unknown>).prompt_tokens || 0,
      output_tokens: (chatBody.usage as Record<string, unknown>).completion_tokens || 0,
      total_tokens: (chatBody.usage as Record<string, unknown>).total_tokens || 0,
    };
  }

  return result;
}

export function convertStreamToResponsesFormat(response: Response): Response {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  let responseId: string | undefined;
  let responseModel: string | undefined;
  let responseCreated: number | undefined;
  let outputItemId: string | undefined;
  let hasSentCreated = false;
  let hasSentOutputItem = false;
  const outputIndex = 0;
  let buffer = '';

  const transformStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data:')) {
          if (line.trim()) controller.enqueue(encoder.encode(line + '\n'));
          continue;
        }

        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          if (responseId) {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.completed', response: { id: responseId, object: 'response', created_at: responseCreated, model: responseModel, output: [] } })}\n\n`));
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
          continue;
        }

        try {
          const json = JSON.parse(data);

          if (!responseId && json.id) {
            responseId = json.id.replace('chatcmpl', 'resp');
            responseModel = json.model;
            responseCreated = json.created;
            if (!hasSentCreated) {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.created', response: { id: responseId, object: 'response', created_at: responseCreated, model: responseModel, output: [] } })}\n\n`));
              hasSentCreated = true;
            }
          }

          if (json.choices && Array.isArray(json.choices)) {
            for (const choice of json.choices) {
              const delta = choice.delta;
              if (!delta) continue;

              if (!hasSentOutputItem && delta.role) {
                outputItemId = `msg_${Date.now()}`;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.output_item.added', output_index: outputIndex, item: { id: outputItemId, type: 'message', role: delta.role, content: [] } })}\n\n`));
                hasSentOutputItem = true;
              }

              if (delta.content && outputItemId) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.output_text.delta', item_id: outputItemId, output_index: outputIndex, delta: delta.content })}\n\n`));
              }

              if (delta.tool_calls && Array.isArray(delta.tool_calls) && outputItemId) {
                for (const tc of delta.tool_calls) {
                  const toolCall = tc as { index?: number; type?: string; function?: { name?: string; arguments?: string } };
                  if (toolCall.function?.name) {
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.tool_call.delta', item_id: outputItemId, output_index: outputIndex, tool_call: { name: toolCall.function.name, arguments: toolCall.function.arguments } })}\n\n`));
                  }
                }
              }

              if (choice.finish_reason && outputItemId) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'response.output_item.done', output_index: outputIndex, item: { id: outputItemId, type: 'message', role: delta.role || 'assistant', content: [] } })}\n\n`));
              }
            }
          }
        } catch {
          controller.enqueue(encoder.encode(line + '\n'));
        }
      }
    },
  });

  return new Response(response.body?.pipeThrough(transformStream), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
