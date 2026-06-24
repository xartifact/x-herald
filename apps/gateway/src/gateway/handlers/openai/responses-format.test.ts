import { describe, it, expect } from 'bun:test';
import {
  convertResponsesToChatFormat,
  convertChatToResponsesBody,
  convertStreamToResponsesFormat,
} from './responses-format';

// ─── convertResponsesToChatFormat ───────────────────────────────────────

describe('convertResponsesToChatFormat', () => {
  it('converts normal Responses body with input items and instructions', () => {
    const body = {
      model: 'gpt-4o',
      instructions: 'You are a helpful assistant.',
      input: [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
      max_output_tokens: 1000,
      temperature: 0.7,
      top_p: 0.9,
      stream: true,
    };

    const result = convertResponsesToChatFormat(body);

    expect(result).toEqual({
      model: 'gpt-4o',
      stream: true,
      messages: [
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ],
      max_tokens: 1000,
      temperature: 0.7,
      top_p: 0.9,
    });
  });

  it('returns empty messages array for empty input', () => {
    const body = { model: 'gpt-4o', input: [] };

    const result = convertResponsesToChatFormat(body);

    expect(result).toEqual({ model: 'gpt-4o', stream: false, messages: [] });
  });

  it('handles missing input gracefully', () => {
    const body = { model: 'gpt-4o' };

    const result = convertResponsesToChatFormat(body);

    expect(result).toEqual({ model: 'gpt-4o', stream: false });
    expect(result.messages).toBeUndefined();
  });

  it('skips instructions when not a string', () => {
    const body = { model: 'gpt-4o', instructions: 123, input: [{ role: 'user', content: 'hi' }] };

    const result = convertResponsesToChatFormat(body);

    expect(result.messages).toHaveLength(1);
    expect(result.messages![0].role).toBe('user');
  });

  it('preserves assistant role', () => {
    const body = { model: 'gpt-4o', input: [{ role: 'assistant', content: 'Sure!' }] };

    const result = convertResponsesToChatFormat(body);

    expect(result.messages).toHaveLength(1);
    expect(result.messages![0].role).toBe('assistant');
  });

  it('maps input_text type items to user role', () => {
    const body = { model: 'gpt-4o', input: [{ type: 'input_text', text: 'hello' }] };

    const result = convertResponsesToChatFormat(body);

    expect(result.messages).toHaveLength(1);
    expect(result.messages![0]).toEqual({ role: 'user', content: 'hello' });
  });

  it('sets stream default to false', () => {
    const body = { model: 'gpt-4o', input: [] };

    const result = convertResponsesToChatFormat(body);

    expect(result.stream).toBe(false);
  });

  it('maps max_output_tokens to max_tokens', () => {
    const body = { model: 'gpt-4o', input: [], max_output_tokens: 500 };

    const result = convertResponsesToChatFormat(body);

    expect(result.max_tokens).toBe(500);
    expect((result as Record<string, unknown>).max_output_tokens).toBeUndefined();
  });

  it('passes through tools and tool_choice', () => {
    const body = {
      model: 'gpt-4o',
      input: [{ role: 'user', content: 'call tool' }],
      tools: [{ type: 'function', function: { name: 'get_weather' } }],
      tool_choice: 'auto',
    };

    const result = convertResponsesToChatFormat(body);

    expect(result.tools).toEqual(body.tools);
    expect(result.tool_choice).toBe('auto');
  });

  it('passes through stop and stream_options', () => {
    const body = {
      model: 'gpt-4o',
      input: [{ role: 'user', content: 'hello' }],
      stop: ['\n'],
      stream_options: { include_usage: true },
    };

    const result = convertResponsesToChatFormat(body);

    expect(result.stop).toEqual(['\n']);
    expect(result.stream_options).toEqual({ include_usage: true });
  });

  it('skips null or non-object input items', () => {
    const body = { model: 'gpt-4o', input: [null, 'string', { role: 'user', content: 'ok' }] };

    const result = convertResponsesToChatFormat(body);

    expect(result.messages).toHaveLength(1);
    expect(result.messages![0].content).toBe('ok');
  });

  it('converts string content directly', () => {
    const body = { model: 'gpt-4o', input: [{ role: 'user', content: 'plain string' }] };

    const result = convertResponsesToChatFormat(body);

    expect(result.messages![0].content).toBe('plain string');
  });

  it('converts array content items (input_text -> text)', () => {
    const body = {
      model: 'gpt-4o',
      input: [
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'desc' },
            { type: 'input_image', image_url: { url: 'https://example.com/img.png' } },
          ],
        },
      ],
    };

    const result = convertResponsesToChatFormat(body);

    expect(result.messages![0].content).toEqual([
      { type: 'text', text: 'desc' },
      { type: 'image_url', image_url: { url: 'https://example.com/img.png' } },
    ]);
  });

  it('collapses single-item array content to text string', () => {
    const body = {
      model: 'gpt-4o',
      input: [{ role: 'user', content: [{ type: 'input_text', text: 'single' }] }],
    };

    const result = convertResponsesToChatFormat(body);

    expect(result.messages![0].content).toBe('single');
  });
});

// ─── convertChatToResponsesBody ─────────────────────────────────────────

describe('convertChatToResponsesBody', () => {
  it('converts normal chat completion body', () => {
    const chatBody = {
      id: 'chatcmpl-ABC123',
      object: 'chat.completion',
      created: 1718000000,
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: { role: 'assistant', content: 'Hello world!' },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
    };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.id).toBe('resp-ABC123');
    expect(result.object).toBe('response');
    expect(result.created_at).toBe(1718000000);
    expect(result.model).toBe('gpt-4o');
    expect(result.output).toHaveLength(1);
    expect(result.output[0]).toEqual({
      type: 'message',
      role: 'assistant',
      content: [{ type: 'output_text', text: 'Hello world!' }],
    });
    expect(result.usage).toEqual({
      input_tokens: 10,
      output_tokens: 20,
      total_tokens: 30,
    });
  });

  it('handles missing choices gracefully', () => {
    const chatBody = { id: 'chatcmpl-ABC', object: 'chat.completion', model: 'gpt-4o' };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.output).toEqual([]);
  });

  it('handles empty choices array', () => {
    const chatBody = { id: 'chatcmpl-ABC', model: 'gpt-4o', choices: [] };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.output).toEqual([]);
  });

  it('replaces chatcmpl prefix with resp prefix in ID', () => {
    const chatBody = { id: 'chatcmpl-ABC', model: 'gpt-4o', choices: [] };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.id).toBe('resp-ABC');
  });

  it('generates fallback ID when chatBody.id is missing', () => {
    const chatBody = { model: 'gpt-4o', choices: [] };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.id).toMatch(/^resp_\d{13,}$/);
  });

  it('maps usage keys correctly (prompt_tokens -> input_tokens)', () => {
    const chatBody = {
      id: 'chatcmpl-X',
      model: 'gpt-4o',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
      usage: { prompt_tokens: 5, completion_tokens: 15, total_tokens: 20 },
    };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.usage).toEqual({ input_tokens: 5, output_tokens: 15, total_tokens: 20 });
  });

  it('defaults usage values to 0 when missing', () => {
    const chatBody = {
      id: 'chatcmpl-X',
      model: 'gpt-4o',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
      usage: {},
    };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.usage).toEqual({ input_tokens: 0, output_tokens: 0, total_tokens: 0 });
  });

  it('handles missing usage gracefully', () => {
    const chatBody = {
      id: 'chatcmpl-X',
      model: 'gpt-4o',
      choices: [{ index: 0, message: { role: 'assistant', content: 'ok' } }],
    };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.usage).toBeUndefined();
  });

  it('converts tool_calls in message to function_call output items', () => {
    const chatBody = {
      id: 'chatcmpl-TC',
      model: 'gpt-4o',
      created: 1718000000,
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_abc',
                type: 'function',
                function: { name: 'get_weather', arguments: '{"city":"Paris"}' },
              },
            ],
          },
        },
      ],
    };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.output).toHaveLength(2);
    expect(result.output[0]).toMatchObject({
      type: 'function_call',
      id: 'call_abc',
      name: 'get_weather',
      args: { city: 'Paris' },
    });
    expect(result.output[1]).toMatchObject({
      type: 'message',
      role: 'assistant',
    });
  });

  it('skips choices with missing message', () => {
    const chatBody = {
      id: 'chatcmpl-X',
      model: 'gpt-4o',
      choices: [{ index: 0, message: null }],
    };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.output).toEqual([]);
  });

  it('converts array message content items', () => {
    const chatBody = {
      id: 'chatcmpl-X',
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
          },
        },
      ],
    };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.output[0].content).toEqual([{ type: 'output_text', text: 'Hello' }]);
  });

  it('generates fallback id for tool_call when id is missing', () => {
    const chatBody = {
      id: 'chatcmpl-X',
      model: 'gpt-4o',
      choices: [
        {
          index: 0,
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                type: 'function',
                function: { name: 'get_weather', arguments: '{}' },
              },
            ],
          },
        },
      ],
    };

    const result = convertChatToResponsesBody(chatBody);

    expect(result.output[0].id).toMatch(/^fc_/);
    expect(result.output[0].id).not.toBe('call_abc');
  });
});

// ─── convertStreamToResponsesFormat ─────────────────────────────────────

describe('convertStreamToResponsesFormat', () => {
  async function collectStream(response: Response): Promise<string[]> {
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const lines: string[] = [];
    let buffer = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n');
      buffer = parts.pop() || '';
      for (const part of parts) {
        if (part) lines.push(part);
      }
    }
    if (buffer.trim()) lines.push(buffer);
    return lines;
  }

  function makeStreamResponse(chunks: string[]): Response {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });
    return new Response(stream, {
      status: 200,
      statusText: 'OK',
      headers: { 'content-type': 'text/event-stream' },
    });
  }

  it('passes [DONE] through without response.completed when no prior chunk set responseId', async () => {
    const response = makeStreamResponse(['data: [DONE]\n\n']);
    const transformed = convertStreamToResponsesFormat(response);
    const lines = await collectStream(transformed);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('data: [DONE]');
  });

  it('passes non-data lines through unmodified', async () => {
    const response = makeStreamResponse([': keepalive\n\n']);
    const transformed = convertStreamToResponsesFormat(response);
    const lines = await collectStream(transformed);

    expect(lines).toEqual([': keepalive']);
  });

  it('transforms streaming chat chunks into Responses format', async () => {
    const chunks = [
      `data: ${JSON.stringify({ id: 'chatcmpl-ABC', object: 'chat.completion.chunk', model: 'gpt-4o', created: 1718000000, choices: [{ index: 0, delta: { role: 'assistant' }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ id: 'chatcmpl-ABC', object: 'chat.completion.chunk', model: 'gpt-4o', created: 1718000000, choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }] })}\n\n`,
      `data: ${JSON.stringify({ id: 'chatcmpl-ABC', object: 'chat.completion.chunk', model: 'gpt-4o', created: 1718000000, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\n`,
      'data: [DONE]\n\n',
    ];
    const response = makeStreamResponse(chunks);
    const transformed = convertStreamToResponsesFormat(response);
    const lines = await collectStream(transformed);

    // response.created
    const created = JSON.parse(lines[0].slice(5).trim());
    expect(created.type).toBe('response.created');
    expect(created.response.id).toBe('resp-ABC');
    expect(created.response.model).toBe('gpt-4o');

    // output_item.added
    const added = JSON.parse(lines[1].slice(5).trim());
    expect(added.type).toBe('response.output_item.added');
    expect(added.item.role).toBe('assistant');

    // content delta
    const delta = JSON.parse(lines[2].slice(5).trim());
    expect(delta.type).toBe('response.output_text.delta');
    expect(delta.delta).toBe('Hello');

    // output_item.done
    const done = JSON.parse(lines[3].slice(5).trim());
    expect(done.type).toBe('response.output_item.done');

    // response.completed
    const completed = JSON.parse(lines[4].slice(5).trim());
    expect(completed.type).toBe('response.completed');

    // [DONE]
    expect(lines[5]).toBe('data: [DONE]');
  });

  it('handles malformed JSON data lines gracefully (passthrough)', async () => {
    const response = makeStreamResponse(['data: not-json\n\n']);
    const transformed = convertStreamToResponsesFormat(response);
    const lines = await collectStream(transformed);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('data: not-json');
  });

  it('handles empty data lines gracefully', async () => {
    const response = makeStreamResponse(['data:\n\n']);
    const transformed = convertStreamToResponsesFormat(response);
    const lines = await collectStream(transformed);

    // Empty data after trimming — JSON.parse('') throws, so it falls to catch block
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('data:');
  });

  it('passes through empty body without error', async () => {
    const response = makeStreamResponse(['']);
    const transformed = convertStreamToResponsesFormat(response);
    const lines = await collectStream(transformed);

    expect(lines).toEqual([]);
  });
});