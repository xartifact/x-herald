import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';

const realLib = await import('../../../lib');
const realLogQuery = await import('./log-query');
const realLogger = await import('../../../lib/logger');

// ─── Mock state variables ─────────────────────────────────────────────────────

let getLogDetailResult: unknown = null;
let getAiModelResult: unknown = {
  actualModelName: 'gpt-4',
  apiKey: 'sk-test',
  baseUrl: 'https://api.example.com',
};
let getAiModelShouldReject = false;

// ─── Mock modules ─────────────────────────────────────────────────────────────

class MockAiNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiNotConfiguredError';
  }
}

mock.module('../../../lib', () => ({
  getAiModel: mock(() => {
    if (getAiModelShouldReject) {
      return Promise.reject(new MockAiNotConfiguredError('AI not configured'));
    }
    return Promise.resolve(getAiModelResult);
  }),
  AiNotConfiguredError: MockAiNotConfiguredError,
  callAI: mock(() => Promise.resolve('')),
  CONFIG_KEY_AI_MODEL: 'ai_model',
}));

mock.module('./log-query', () => ({
  getLogDetail: mock(() => Promise.resolve(getLogDetailResult)),
}));

mock.module('../../../lib/logger', () => ({
  default: {
    debug: mock(() => {}),
    info: mock(() => {}),
    error: mock(() => {}),
    warn: mock(() => {}),
    trace: mock(() => {}),
    child: mock(() => ({
      debug: mock(() => {}),
      info: mock(() => {}),
      error: mock(() => {}),
      warn: mock(() => {}),
      trace: mock(() => {}),
    })),
  },
}));

// ─── Mock fetch ───────────────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

// ─── Import module under test ─────────────────────────────────────────────────

const { buildAnalysisStream, AnalyzeLogError } = await import('./log-analyzer');

// ─── Tests ────────────────────────────────────────────────────────────────────

afterAll(() => {
  mock.module('../../../lib', () => realLib);
  mock.module('./log-query', () => realLogQuery);
  mock.module('../../../lib/logger', () => realLogger);
});

describe('AnalyzeLogError', () => {
  it('stores message and statusCode', () => {
    const error = new AnalyzeLogError('Not found', 404);
    expect(error.message).toBe('Not found');
    expect(error.statusCode).toBe(404);
  });

  it('supports 400 statusCode', () => {
    const error = new AnalyzeLogError('Bad request', 400);
    expect(error.statusCode).toBe(400);
  });

  it('supports 503 statusCode', () => {
    const error = new AnalyzeLogError('Service unavailable', 503);
    expect(error.statusCode).toBe(503);
  });
});

describe('buildAnalysisStream', () => {
  beforeEach(() => {
    mock.restore();
    getLogDetailResult = null;
    getAiModelResult = {
      actualModelName: 'gpt-4',
      apiKey: 'sk-test',
      baseUrl: 'https://api.example.com',
    };
    getAiModelShouldReject = false;
    globalThis.fetch = originalFetch;
  });

  it('throws 404 when log not found', async () => {
    getLogDetailResult = null;
    await expect(buildAnalysisStream('nonexistent')).rejects.toThrow('Log not found');
  });

  it('throws 400 when log has no messages', async () => {
    getLogDetailResult = { requestBody: { messages: [] } };
    await expect(buildAnalysisStream('log-empty')).rejects.toThrow('No messages in this log');
  });

  it('throws 400 when requestBody is missing messages', async () => {
    getLogDetailResult = { requestBody: {} };
    await expect(buildAnalysisStream('log-no-messages')).rejects.toThrow('No messages in this log');
  });

  it('throws 503 when AI is not configured', async () => {
    getLogDetailResult = {
      requestBody: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    };
    getAiModelShouldReject = true;
    await expect(buildAnalysisStream('log-1')).rejects.toThrow('AI not configured');
  });

  it('returns error stream when provider returns non-ok status', async () => {
    getLogDetailResult = {
      requestBody: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    };

    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      } as Response)
    );

    const stream = await buildAnalysisStream('log-1');
    const reader = stream.getReader();
    const result = await reader.read();
    const text = new TextDecoder().decode(result.value);
    expect(text).toContain('Provider returned 500');
    reader.releaseLock();
  });

  it('returns provider body stream when provider returns ok', async () => {
    getLogDetailResult = {
      requestBody: {
        messages: [{ role: 'user', content: 'hello' }],
      },
    };

    const mockStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: test\n\n'));
        controller.close();
      },
    });

    globalThis.fetch = mock(() =>
      Promise.resolve({
        ok: true,
        body: mockStream,
      } as Response)
    );

    const stream = await buildAnalysisStream('log-1');
    expect(stream).toBe(mockStream);
  });
});
