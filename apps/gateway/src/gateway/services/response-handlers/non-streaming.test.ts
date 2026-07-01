import { beforeEach, afterEach, afterAll, describe, expect, it, mock } from 'bun:test';

import { createTestVirtualKey } from '../../../test/factories';
import type { ResponseHandlerParams } from './params';
const { handleNonStreamingResponse } = await import('./non-streaming?v=1');

// ------------------------------------------------------------------
//  Capture real modules before mocking
// ------------------------------------------------------------------
const realTransformer = await import('../../transformer');
const realLogService = await import('../log-service');

// ------------------------------------------------------------------
//  Mock modules
// ------------------------------------------------------------------
const mockLogRequest = mock(() => Promise.resolve());
const mockGetTransformer = mock((..._args: any[]): any => undefined);

mock.module('../../transformer', () => ({
  getTransformer: mockGetTransformer,
}));

mock.module('../log-service', () => ({
  logRequest: mockLogRequest,
}));

// ------------------------------------------------------------------
//  Helpers
// ------------------------------------------------------------------

function createMockContext() {
  const headers: Record<string, string> = {};
  return {
    json: (body: unknown) => new Response(JSON.stringify(body), { status: 200 }),
    header: (key: string, value: string) => { headers[key] = value; },
    req: { path: '/v1/chat/completions', method: 'POST' },
    _headers: headers,
  } as unknown as ResponseHandlerParams['c'];
}

function createParams(overrides: Partial<ResponseHandlerParams> = {}): ResponseHandlerParams {
  return {
    c: createMockContext(),
    response: new Response(JSON.stringify({ id: 'test', model: 'gpt-4', choices: [{ message: { role: 'assistant', content: 'Hello' } }] }), {
      headers: { 'content-type': 'application/json' },
    }),
    ctx: { requestId: 'test-req', state: new Map() } as any,
    incomingProtocol: 'openai',
    targetProtocol: 'openai',
    virtualKey: createTestVirtualKey(),
    provider: { id: 'provider-1', name: 'TestProvider' },
    originalModelName: 'gpt-4',
    startTime: Date.now() - 100,
    preprocessEndTime: Date.now() - 50,
    providerTtfbTime: Date.now() - 10,
    requestHeaders: {},
    rawBody: { model: 'gpt-4', messages: [] },
    clientIp: '127.0.0.1',
    userAgent: 'test-agent',
    requestPath: '/v1/chat/completions',
    requestMethod: 'POST',
    ...overrides,
  };
}

// ------------------------------------------------------------------
//  Tests
// ------------------------------------------------------------------

describe('handleNonStreamingResponse', () => {
  beforeEach(() => {
    mockLogRequest.mockClear();
    mockGetTransformer.mockClear();
  });

  afterEach(() => {
    mockLogRequest.mockClear();
    mockGetTransformer.mockClear();
  });

  afterAll(async () => {
    const realTransformer = await import('../../transformer');
    const realLogService = await import('../log-service');
    mock.module('../../transformer', () => realTransformer);
    mock.module('../log-service', () => realLogService);
  });

  /* 1. SSE content-type → forwards as stream */
  it('forwards SSE response as stream when content-type is text/event-stream', async () => {
    const sseBody = 'data: {"id":"stream-1","choices":[]}\n\ndata: [DONE]\n\n';
    const params = createParams({
      response: new Response(sseBody, { headers: { 'content-type': 'text/event-stream' } }),
    });

    const result = await handleNonStreamingResponse(params);

    expect(result).toBeInstanceOf(Response);
    expect(result.headers.get('content-type')).toContain('text/event-stream');
    expect(result.body).toBeTruthy();

    const text = await result.text();
    expect(text).toContain('stream-1');
    expect(text).toContain('[DONE]');

    expect(mockLogRequest).toHaveBeenCalledTimes(1);
    const logCall = (mockLogRequest.mock.calls as any[][])[0][0] as Record<string, unknown>;
    expect(logCall.streaming).toBe(true);
  });

  /* 2. Passthrough enabled → returns JSON with model remapped when isMapped=true */
  it('remaps model in passthrough when isMapped=true', async () => {
    const params = createParams({
      isPassthroughEnabled: true,
      isMapped: true,
      originalModelName: 'virtual-model',
      response: new Response(JSON.stringify({ id: 'p1', model: 'backend-model', choices: [] }), { headers: { 'content-type': 'application/json' } }),
    });

    const result = await handleNonStreamingResponse(params);
    const json = await result.json() as Record<string, unknown>;

    expect(json.model).toBe('virtual-model');
    expect(mockLogRequest).toHaveBeenCalledTimes(1);
  });

  /* 3. Passthrough enabled → returns JSON without remap when isMapped=false */
  it('does not remap model in passthrough when isMapped=false', async () => {
    const params = createParams({
      isPassthroughEnabled: true,
      isMapped: false,
      originalModelName: 'virtual-model',
      response: new Response(JSON.stringify({ id: 'p2', model: 'backend-model', choices: [] }), { headers: { 'content-type': 'application/json' } }),
    });

    const result = await handleNonStreamingResponse(params);
    const json = await result.json() as Record<string, unknown>;

    expect(json.model).toBe('backend-model');
    expect(mockLogRequest).toHaveBeenCalledTimes(1);
  });

  /* 4. Transformed → calls getTransformer for both target and incoming protocols */
  it('calls getTransformer for target and incoming protocols in transformed path', async () => {
    const normalizeResponse = mock(async () => ({ id: 'std', model: 'std-model', choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } }));
    const adaptResponse = mock(async () => new Response(JSON.stringify({ id: 'adapted', model: 'adapted-model' }), { status: 200 }));

    mockGetTransformer.mockImplementation((name: string) => {
      if (name === 'openai') {
        return { normalizeResponse, adaptResponse };
      }
      return undefined;
    });

    const params = createParams({
      incomingProtocol: 'openai',
      targetProtocol: 'openai',
    });

    await handleNonStreamingResponse(params);

    expect(mockGetTransformer).toHaveBeenCalledTimes(2);
    expect(mockGetTransformer).toHaveBeenNthCalledWith(1, 'openai');
    expect(mockGetTransformer).toHaveBeenNthCalledWith(2, 'openai');
    expect(normalizeResponse).toHaveBeenCalledTimes(1);
    expect(adaptResponse).toHaveBeenCalledTimes(1);
  });

  /* 5. Transformed → throws when no response normalizer found */
  it('throws when no response normalizer is found for target protocol', async () => {
    mockGetTransformer.mockReturnValue(undefined);

    const params = createParams({
      targetProtocol: 'anthropic',
      incomingProtocol: 'openai',
    });

    await expect(handleNonStreamingResponse(params)).rejects.toThrow('No response normalizer for protocol: anthropic');
  });

  /* 6. Transformed → throws when no response adapter found for incoming protocol */
  it('throws when no response adapter is found for incoming protocol', async () => {
    const normalizeResponse = mock(async () => ({ id: 'std', model: 'std-model', choices: [] }));

    mockGetTransformer.mockImplementation((name: string) => {
      if (name === 'anthropic') {
        return { normalizeResponse };
      }
      return undefined;
    });

    const params = createParams({
      targetProtocol: 'anthropic',
      incomingProtocol: 'gemini',
    });

    await expect(handleNonStreamingResponse(params)).rejects.toThrow('No response adapter for protocol: gemini');
  });

  /* 7. Transformed → throws when provider returns error in JSON body */
  it('throws when provider JSON body contains an error field', async () => {
    const params = createParams({
      response: new Response(JSON.stringify({ error: { message: 'Bad API key', type: 'invalid_request_error' } }), { headers: { 'content-type': 'application/json' } }),
    });

    await expect(handleNonStreamingResponse(params)).rejects.toThrow('Provider error: Bad API key');
  });

  /* 8. Transformed → throws when response has no body */
  it('throws when provider response has no body', async () => {
    const params = createParams({
      response: new Response(null, { status: 200, headers: { 'content-type': 'application/json' } }),
    });

    await expect(handleNonStreamingResponse(params)).rejects.toThrow('Provider returned empty response body');
  });

  /* 9. Transformed → remaps model when isMapped and originalModelName set */
  it('remaps model in transformed path when isMapped=true', async () => {
    const normalizeResponse = mock(async () => ({ id: 'std', model: 'backend', choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } }));
    const adaptResponse = mock(async () => new Response(JSON.stringify({ id: 'out', model: 'backend' }), { status: 200 }));

    mockGetTransformer.mockImplementation(() => ({ normalizeResponse, adaptResponse }));

    const params = createParams({
      isMapped: true,
      originalModelName: 'virtual-model',
      incomingProtocol: 'openai',
      targetProtocol: 'openai',
    });

    const result = await handleNonStreamingResponse(params);
    const json = await result.json() as Record<string, unknown>;

    expect(json.model).toBe('virtual-model');
  });

  /* 10. logRequest is called in all paths */
  it('calls logRequest in passthrough path', async () => {
    const params = createParams({
      isPassthroughEnabled: true,
      response: new Response(JSON.stringify({ id: 'log-test', model: 'm' }), { headers: { 'content-type': 'application/json' } }),
    });

    await handleNonStreamingResponse(params);
    expect(mockLogRequest).toHaveBeenCalledTimes(1);
  });

  it('calls logRequest in SSE forward path', async () => {
    const params = createParams({
      response: new Response('data: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } }),
    });

    await handleNonStreamingResponse(params);
    expect(mockLogRequest).toHaveBeenCalledTimes(1);
  });

  it('calls logRequest in transformed path', async () => {
    const normalizeResponse = mock(async () => ({ id: 'std', model: 'm', choices: [], usage: { prompt_tokens: 1, completion_tokens: 2 } }));
    const adaptResponse = mock(async () => new Response(JSON.stringify({ id: 'out', model: 'm' }), { status: 200 }));

    mockGetTransformer.mockImplementation(() => ({ normalizeResponse, adaptResponse }));

    const params = createParams({
      incomingProtocol: 'openai',
      targetProtocol: 'openai',
    });

    await handleNonStreamingResponse(params);
    expect(mockLogRequest).toHaveBeenCalledTimes(1);
    expect((mockLogRequest.mock.calls as any[][])[0][0]).toMatchObject({
      streaming: false,
      providerName: 'TestProvider',
    });
  });
});
