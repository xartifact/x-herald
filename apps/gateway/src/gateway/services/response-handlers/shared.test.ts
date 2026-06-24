import { describe, expect, it } from 'bun:test';

import {
  createModelRemapStream,
  extractProviderResponseHeaders,
  extractUsageFromChunk,
  getClientNonStreamingHeaders,
  getClientStreamingHeaders,
  mergeResponseHeaders,
  StreamResponseCollector,
} from './shared';

async function runTransform(
  input: string,
  transform: TransformStream<Uint8Array, Uint8Array>,
): Promise<string> {
  const encoder = new TextEncoder();
  const source = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(input));
      controller.close();
    },
  });
  const transformed = source.pipeThrough(transform);
  const response = new Response(transformed);
  return response.text();
}

/* ------------------------------------------------------------------ */
/*  extractProviderResponseHeaders                                      */
/* ------------------------------------------------------------------ */

describe('extractProviderResponseHeaders', () => {
  it('converts all header keys to lowercase and preserves values', () => {
    const headers = new Headers({
      'Content-Type': 'application/json',
      'X-Custom-Header': 'custom-value',
      'cache-control': 'no-cache',
    });
    const response = new Response(null, { headers });
    const result = extractProviderResponseHeaders(response);

    expect(result).toEqual({
      'content-type': 'application/json',
      'x-custom-header': 'custom-value',
      'cache-control': 'no-cache',
    });
  });

  it('returns an empty object when response has no headers', () => {
    const response = new Response(null);
    const result = extractProviderResponseHeaders(response);

    expect(result).toEqual({});
  });
});

/* ------------------------------------------------------------------ */
/*  mergeResponseHeaders                                                */
/* ------------------------------------------------------------------ */

describe('mergeResponseHeaders', () => {
  it('merges provider and gateway headers, with gateway overriding', () => {
    const providerHeaders = {
      'content-type': 'text/plain',
      'x-custom': 'provider',
    };
    const gatewayHeaders = { 'content-type': 'application/json' };
    const result = mergeResponseHeaders(gatewayHeaders, providerHeaders);

    expect(result).toEqual({
      'content-type': 'application/json',
      'x-custom': 'provider',
    });
  });

  it('filters out empty provider header values', () => {
    const providerHeaders = {
      'content-type': 'text/plain',
      'x-empty': '',
      'x-whitespace': '   ',
    };
    const gatewayHeaders = {};
    const result = mergeResponseHeaders(gatewayHeaders, providerHeaders);

    expect(result).toEqual({ 'content-type': 'text/plain' });
  });

  it('returns only gateway headers when provider headers are empty', () => {
    const gatewayHeaders = { 'x-gateway': 'true' };
    const result = mergeResponseHeaders(gatewayHeaders, {});

    expect(result).toEqual({ 'x-gateway': 'true' });
  });
});

/* ------------------------------------------------------------------ */
/*  createModelRemapStream                                              */
/* ------------------------------------------------------------------ */

describe('createModelRemapStream', () => {
  it('remaps OpenAI model field in SSE data lines', async () => {
    const input = 'data: {"model":"gpt-4","choices":[]}\n\n';
    const stream = createModelRemapStream('virtual-model');
    const result = await runTransform(input, stream);

    expect(result).toBe('data: {"model":"virtual-model","choices":[]}\n\n');
  });

  it('remaps Anthropic message_start model field', async () => {
    const input =
      'data: {"type":"message_start","message":{"model":"claude-3"}}\n\n';
    const stream = createModelRemapStream('virtual-model');
    const result = await runTransform(input, stream);

    expect(result).toBe(
      'data: {"type":"message_start","message":{"model":"virtual-model"}}\n\n',
    );
  });

  it('preserves [DONE] lines unchanged', async () => {
    const input = 'data: [DONE]\n\n';
    const stream = createModelRemapStream('virtual-model');
    const result = await runTransform(input, stream);

    expect(result).toBe('data: [DONE]\n\n');
  });

  it('preserves non-data lines', async () => {
    const input = ': ping\nevent: message\n\n';
    const stream = createModelRemapStream('virtual-model');
    const result = await runTransform(input, stream);

    expect(result).toBe(': ping\nevent: message\n\n');
  });

  it('preserves lines with invalid JSON', async () => {
    const input = 'data: not-json\n\n';
    const stream = createModelRemapStream('virtual-model');
    const result = await runTransform(input, stream);

    expect(result).toBe('data: not-json\n\n');
  });

  it('remaps both OpenAI and Anthropic models in a single stream', async () => {
    const input = [
      'data: {"type":"message_start","message":{"model":"claude-3"}}\n',
      'data: {"model":"gpt-4","choices":[]}\n',
      'data: [DONE]\n',
    ].join('');
    const stream = createModelRemapStream('virtual-model');
    const result = await runTransform(input, stream);

    expect(result).toContain('"model":"virtual-model"');
    expect(result).toContain('[DONE]');
  });
});

/* ------------------------------------------------------------------ */
/*  getClientNonStreamingHeaders                                        */
/* ------------------------------------------------------------------ */

describe('getClientNonStreamingHeaders', () => {
  it('returns application/json with utf-8 charset', () => {
    const result = getClientNonStreamingHeaders();

    expect(result).toEqual({
      'content-type': 'application/json; charset=utf-8',
    });
  });
});

/* ------------------------------------------------------------------ */
/*  getClientStreamingHeaders                                         */
/* ------------------------------------------------------------------ */

describe('getClientStreamingHeaders', () => {
  it('returns standard SSE content-type when no provider type given', () => {
    const result = getClientStreamingHeaders();

    expect(result).toEqual({ 'content-type': 'text/event-stream' });
  });

  it('preserves provider content-type when it is already SSE', () => {
    const result = getClientStreamingHeaders('text/event-stream; charset=utf-8');

    expect(result).toEqual({ 'content-type': 'text/event-stream; charset=utf-8' });
  });

  it('returns standard SSE when provider type is not SSE', () => {
    const result = getClientStreamingHeaders('application/json');

    expect(result).toEqual({ 'content-type': 'text/event-stream' });
  });
});

/* ------------------------------------------------------------------ */
/*  extractUsageFromChunk                                               */
/* ------------------------------------------------------------------ */

describe('extractUsageFromChunk', () => {
  it('extracts usage from standard StreamChunk format', () => {
    const chunk = JSON.stringify({
      object: 'chat.completion.chunk',
      usage: { prompt_tokens: 10, completion_tokens: 20 },
    });
    const result = extractUsageFromChunk(chunk);

    expect(result).toEqual({ prompt_tokens: 10, completion_tokens: 20 });
  });

  it('extracts usage from OpenAI raw format', () => {
    const chunk = JSON.stringify({
      usage: { prompt_tokens: 5, completion_tokens: 15 },
      choices: [],
    });
    const result = extractUsageFromChunk(chunk);

    expect(result).toEqual({ prompt_tokens: 5, completion_tokens: 15 });
  });

  it('extracts usage from Anthropic message_delta format', () => {
    const chunk = JSON.stringify({
      type: 'message_delta',
      usage: { input_tokens: 8, output_tokens: 12 },
    });
    const result = extractUsageFromChunk(chunk);

    expect(result).toEqual({ prompt_tokens: 8, completion_tokens: 12 });
  });

  it('extracts usage from Anthropic message_start format', () => {
    const chunk = JSON.stringify({
      type: 'message_start',
      message: { usage: { input_tokens: 3, output_tokens: 7 } },
    });
    const result = extractUsageFromChunk(chunk);

    expect(result).toEqual({ prompt_tokens: 3, completion_tokens: 7 });
  });

  it('returns null for invalid JSON', () => {
    const result = extractUsageFromChunk('not valid json');

    expect(result).toBeNull();
  });

  it('returns null for JSON without usage fields', () => {
    const chunk = JSON.stringify({ type: 'content_block_delta', delta: { text: 'hello' } });
    const result = extractUsageFromChunk(chunk);

    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  StreamResponseCollector                                             */
/* ------------------------------------------------------------------ */

describe('StreamResponseCollector', () => {
  describe('processEvent', () => {
    it('extracts OpenAI text delta content', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(JSON.stringify({ choices: [{ delta: { content: 'hello' } }] }));

      const content = collector.getFullContent();
      expect(content.contentChunks).toEqual(['hello']);
    });

    it('extracts Anthropic text_delta content', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } }),
      );

      const content = collector.getFullContent();
      expect(content.contentChunks).toEqual(['world']);
    });

    it('extracts OpenAI reasoning_content as thinking', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ choices: [{ delta: { reasoning_content: 'I think' } }] }),
      );

      const content = collector.getFullContent();
      expect(content.thinkingBlocks).toEqual(['I think']);
    });

    it('extracts Anthropic thinking_delta as thinking', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({
          type: 'content_block_delta',
          delta: { type: 'thinking_delta', thinking: 'therefore' },
        }),
      );

      const content = collector.getFullContent();
      expect(content.thinkingBlocks).toEqual(['therefore']);
    });

    it('extracts Anthropic redacted_thinking_delta as thinking', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({
          type: 'content_block_delta',
          delta: { type: 'redacted_thinking_delta', data: 'abc123' },
        }),
      );

      const content = collector.getFullContent();
      expect(content.thinkingBlocks).toEqual(['abc123']);
    });

    it('sets hasToolCalls when tool_calls are present', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ choices: [{ delta: { tool_calls: [{ id: '1' }] } }] }),
      );

      const summary = collector.getSummary('openai') as Record<string, unknown>;
      expect(summary.hasToolCalls).toBe(true);
    });

    it('records finish_reason from OpenAI format', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ choices: [{ finish_reason: 'stop' }] }),
      );

      const summary = collector.getSummary('openai') as Record<string, unknown>;
      expect(summary.finishReason).toBe('stop');
    });

    it('records finish_reason from Anthropic delta stop_reason', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ delta: { stop_reason: 'end_turn' } }),
      );

      const summary = collector.getSummary('anthropic') as Record<string, unknown>;
      expect(summary.finishReason).toBe('end_turn');
    });

    it('sets providerModel from OpenAI model field', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ model: 'gpt-4o', choices: [] }),
      );

      expect(collector.getProviderModel()).toBe('gpt-4o');
    });

    it('sets providerModel from Anthropic message_start model', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ type: 'message_start', message: { model: 'claude-3-sonnet' } }),
      );

      expect(collector.getProviderModel()).toBe('claude-3-sonnet');
    });

    it('populates realUsage when usage is present in chunk', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({
          object: 'chat.completion.chunk',
          usage: { prompt_tokens: 5, completion_tokens: 10 },
        }),
      );

      const usage = collector.getUsage();
      expect(usage.inputTokens).toBe(5);
      expect(usage.outputTokens).toBe(10);
      expect(usage.estimated).toBe(false);
    });

    it('silently ignores invalid JSON events', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent('not json');

      const content = collector.getFullContent();
      expect(content.contentChunks).toEqual([]);
      expect(content.thinkingBlocks).toEqual([]);
      expect(content.allChunks).toEqual([]);
    });

    it('records firstThinkingChunkTime from content_block_start with thinking type', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ type: 'content_block_start', content_block: { type: 'thinking' } }),
      );

      const times = collector.getFirstChunkTimes();
      expect(typeof times.firstThinkingChunkTime).toBe('number');
      expect(times.firstThinkingChunkTime).toBeGreaterThan(0);
    });

    it('records firstTextChunkTime when text content arrives', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }),
      );

      const times = collector.getFirstChunkTimes();
      expect(typeof times.firstTextChunkTime).toBe('number');
      expect(times.firstTextChunkTime).toBeGreaterThan(0);
    });

    it('increments eventCount for multiple events', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(JSON.stringify({ choices: [{ delta: { content: 'a' } }] }));
      collector.processEvent(JSON.stringify({ choices: [{ delta: { content: 'b' } }] }));
      collector.processEvent(JSON.stringify({ choices: [{ delta: { content: 'c' } }] }));

      const progress = collector.getProgress();
      expect(progress.chunksProcessed).toBe(3);
    });

    it('accumulates bytesReceived across events', () => {
      const collector = new StreamResponseCollector();
      const event1 = JSON.stringify({ choices: [{ delta: { content: 'a' } }] });
      const event2 = JSON.stringify({ choices: [{ delta: { content: 'bb' } }] });
      collector.processEvent(event1);
      collector.processEvent(event2);

      const progress = collector.getProgress();
      expect(progress.bytesReceived).toBe(event1.length + event2.length);
    });
  });

  describe('getUsage', () => {
    it('returns estimated=true when no real usage is available', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ choices: [{ delta: { content: 'Hello world' } }] }),
      );

      const usage = collector.getUsage();
      expect(usage.estimated).toBe(true);
      expect(usage.inputTokens).toBe(0);
      expect(usage.outputTokens).toBeGreaterThan(0);
    });

    it('returns estimated=false when real usage is present', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({
          object: 'chat.completion.chunk',
          usage: { prompt_tokens: 10, completion_tokens: 20 },
        }),
      );

      const usage = collector.getUsage();
      expect(usage.estimated).toBe(false);
      expect(usage.inputTokens).toBe(10);
      expect(usage.outputTokens).toBe(20);
    });

    it('estimates missing completion_tokens when only prompt_tokens is real', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ choices: [{ delta: { content: 'test content' } }] }),
      );
      collector.processEvent(
        JSON.stringify({
          object: 'chat.completion.chunk',
          usage: { prompt_tokens: 5 },
        }),
      );

      const usage = collector.getUsage();
      expect(usage.estimated).toBe(true);
      expect(usage.inputTokens).toBe(5);
      expect(usage.outputTokens).toBeGreaterThan(0);
    });
  });

  describe('getSummary', () => {
    it('returns correct summary fields', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ choices: [{ delta: { content: 'Hello' } }] }),
      );
      collector.processEvent(
        JSON.stringify({ choices: [{ delta: { content: ' world' } }] }),
      );
      collector.processEvent(
        JSON.stringify({ choices: [{ finish_reason: 'stop' }] }),
      );

      const summary = collector.getSummary('openai') as Record<string, unknown>;
      expect(summary.type).toBe('stream_summary');
      expect(summary.protocol).toBe('openai');
      expect(summary.eventCount).toBe(3);
      expect(summary.contentText).toBe('Hello world');
      expect(summary.finishReason).toBe('stop');
      expect(summary.hasToolCalls).toBe(false);
      expect(summary.bytesReceived).toBeGreaterThan(0);
    });

    it('includes model in summary when providerModel is set', () => {
      const collector = new StreamResponseCollector();
      collector.processEvent(
        JSON.stringify({ model: 'gpt-4', choices: [] }),
      );

      const summary = collector.getSummary('openai') as Record<string, unknown>;
      expect(summary.model).toBe('gpt-4');
    });
  });

  describe('getProgress', () => {
    it('returns zero progress before any events', () => {
      const collector = new StreamResponseCollector();
      const progress = collector.getProgress();

      expect(progress.chunksProcessed).toBe(0);
      expect(progress.bytesReceived).toBe(0);
      expect(typeof progress.lastChunkAt).toBe('number');
    });
  });

  describe('getProviderModel', () => {
    it('returns null before any events', () => {
      const collector = new StreamResponseCollector();
      expect(collector.getProviderModel()).toBeNull();
    });
  });

  describe('getFullContent', () => {
    it('returns empty arrays before any events', () => {
      const collector = new StreamResponseCollector();
      const content = collector.getFullContent();

      expect(content.thinkingBlocks).toEqual([]);
      expect(content.contentChunks).toEqual([]);
      expect(content.allChunks).toEqual([]);
    });

    it('stores all parsed chunks in allChunks', () => {
      const collector = new StreamResponseCollector();
      const chunk1 = { choices: [{ delta: { content: 'a' } }] };
      const chunk2 = { choices: [{ delta: { content: 'b' } }] };
      collector.processEvent(JSON.stringify(chunk1));
      collector.processEvent(JSON.stringify(chunk2));

      const content = collector.getFullContent();
      expect(content.allChunks).toHaveLength(2);
      expect(content.allChunks[0]).toEqual(chunk1);
      expect(content.allChunks[1]).toEqual(chunk2);
    });
  });

  describe('getFirstChunkTimes', () => {
    it('returns null times before any events', () => {
      const collector = new StreamResponseCollector();
      const times = collector.getFirstChunkTimes();

      expect(times.firstThinkingChunkTime).toBeNull();
      expect(times.firstTextChunkTime).toBeNull();
    });
  });
});
