import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';
import type {
  Transformer,
  TransformerContext,
  StandardRequest,
  StandardResponse,
} from '@xartifact/x-llm-gateway-shared';

const realRegistry = await import('./registry');
const originalGetTransformer = realRegistry.getTransformer;

// --- mock registry before importing chain ---
const getTransformerMock = mock((name: string) => undefined as Transformer | undefined);

mock.module('./registry', () => ({
  getTransformer: getTransformerMock,
}));

// --- import chain after mocking registry ---
import { TransformerChain, buildRequestChain, buildResponseChain } from './chain';

// --- helpers ---

function createMockTransformer(
  name: string,
  overrides: Partial<Transformer> = {},
): Transformer {
  return {
    name,
    normalizeRequest: mock(async (req: unknown, ctx: TransformerContext) => req),
    adaptRequest: mock(async (req: StandardRequest, ctx: TransformerContext) => ({ body: req })),
    normalizeResponse: mock(async (res: Response, ctx: TransformerContext) => res as unknown as StandardResponse),
    adaptResponse: mock(async (res: StandardResponse, ctx: TransformerContext) => new Response()),
    transformStream: mock(async (stream: ReadableStream, ctx: TransformerContext) => stream),
    ...overrides,
  } as Transformer;
}

function createContext(): TransformerContext {
  return {
    requestId: 'test-req-123',
    state: new Map<string, unknown>(),
    request: { model: '', messages: [] },
    provider: { name: '', baseUrl: '', apiKey: '', protocol: 'openai' as const, models: [] },
    model: '',
    headers: {},
    metadata: {},
    startTime: Date.now(),
  };
}

function createStringStream(text: string): ReadableStream {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(text));
      controller.close();
    },
  });
}

async function readStream(stream: ReadableStream): Promise<string> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let result = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}

function createStreamTransformingTransformer(
  name: string,
  transform: (text: string) => string,
): Transformer {
  return createMockTransformer(name, {
    transformStream: mock(async (stream: ReadableStream) => {
      const text = await readStream(stream);
      return createStringStream(transform(text));
    }),
  });
}

// --- tests ---

afterAll(() => {
  mock.module('./registry', () => ({
    getTransformer: originalGetTransformer,
  }));
});

describe('TransformerChain', () => {
  beforeEach(() => {
    getTransformerMock.mockClear();
    getTransformerMock.mockReturnValue(undefined);
  });

  describe('constructor', () => {
    it('creates chain with no transformers for empty names', async () => {
      const chain = new TransformerChain([], 'request');
      const ctx = createContext();
      const result = await chain.normalize({ test: true }, ctx);

      expect(result.data as unknown).toEqual({ test: true });
      expect(result.metadata.transformers).toEqual([]);
    });

    it('silently filters out unknown transformer names', async () => {
      getTransformerMock.mockReturnValue(undefined);
      const chain = new TransformerChain(['unknown-t'], 'request');
      const ctx = createContext();
      const result = await chain.normalize({ test: true }, ctx);

      expect(result.data as unknown).toEqual({ test: true });
      expect(result.metadata.transformers).toEqual([]);
      expect(getTransformerMock).toHaveBeenCalledWith('unknown-t');
    });

    it('resolves valid transformer names from registry', async () => {
      const mockT = createMockTransformer('valid-t');
      getTransformerMock.mockReturnValue(mockT);
      const chain = new TransformerChain(['valid-t'], 'request');
      const ctx = createContext();
      await chain.normalize({ test: true }, ctx);

      expect(mockT.normalizeRequest).toHaveBeenCalled();
    });
  });

  describe('normalize', () => {
    it('runs all transformers that have normalizeRequest, in order', async () => {
      const t1 = createMockTransformer('t1');
      const t2 = createMockTransformer('t2');
      getTransformerMock.mockImplementation((name: string) => {
        if (name === 't1') return t1;
        if (name === 't2') return t2;
        return undefined;
      });

      const chain = new TransformerChain(['t1', 't2'], 'request');
      const ctx = createContext();
      const result = await chain.normalize({ value: 1 }, ctx);

      expect(t1.normalizeRequest).toHaveBeenCalledWith({ value: 1 }, ctx);
      expect(t2.normalizeRequest).toHaveBeenCalledWith({ value: 1 }, ctx);
      expect(result.metadata.transformers).toEqual(['t1', 't2']);
    });

    it('skips transformers without normalizeRequest', async () => {
      const t1 = createMockTransformer('t1', { normalizeRequest: undefined });
      const t2 = createMockTransformer('t2');
      getTransformerMock.mockImplementation((name: string) => {
        if (name === 't1') return t1;
        if (name === 't2') return t2;
        return undefined;
      });

      const chain = new TransformerChain(['t1', 't2'], 'request');
      const ctx = createContext();
      const result = await chain.normalize({ value: 1 }, ctx);

      expect(t1.normalizeRequest).toBeUndefined();
      expect(t2.normalizeRequest).toHaveBeenCalledTimes(1);
      expect(result.metadata.transformers).toEqual(['t2']);
    });

    it('passes output of one transformer as input to next', async () => {
      const t1 = createMockTransformer('t1', {
        normalizeRequest: mock(async (req: unknown, _ctx: TransformerContext) => ({ ...(req as object), step: 1 }) as unknown as StandardRequest),
      });
      const t2 = createMockTransformer('t2', {
        normalizeRequest: mock(async (req: unknown, _ctx: TransformerContext) => ({ ...(req as object), step: 2 }) as unknown as StandardRequest),
      });
      getTransformerMock.mockImplementation((name: string) => {
        if (name === 't1') return t1;
        if (name === 't2') return t2;
        return undefined;
      });

      const chain = new TransformerChain(['t1', 't2'], 'request');
      const ctx = createContext();
      const result = await chain.normalize({ base: true }, ctx);

      expect(t1.normalizeRequest).toHaveBeenCalledWith({ base: true }, ctx);
      expect(t2.normalizeRequest).toHaveBeenCalledWith({ base: true, step: 1 }, ctx);
      expect(result.data as unknown).toEqual({ base: true, step: 2 });
    });

    it('returns metadata with executed transformer names and duration', async () => {
      const t1 = createMockTransformer('t1');
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      const result = await chain.normalize({ value: 1 }, ctx);

      expect(result.metadata.transformers).toEqual(['t1']);
      expect(typeof result.metadata.duration).toBe('number');
      expect(result.metadata.duration).toBeGreaterThanOrEqual(0);
    });

    it('re-throws transformer error', async () => {
      const t1 = createMockTransformer('t1', {
        normalizeRequest: mock(async () => {
          throw new Error('normalize error');
        }),
      });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      await expect(chain.normalize({ value: 1 }, ctx)).rejects.toThrow('normalize error');
    });
  });

  describe('adapt', () => {
    it('runs both normalizeRequest AND adaptRequest on each transformer', async () => {
      const t1 = createMockTransformer('t1');
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      const result = await chain.adapt({ model: 'test' } as StandardRequest, ctx);

      expect(t1.normalizeRequest).toHaveBeenCalled();
      expect(t1.adaptRequest).toHaveBeenCalled();
      expect(result.metadata.transformers).toContain('t1:normalize');
      expect(result.metadata.transformers).toContain('t1:adapt');
    });

    it('passes normalized request to adaptRequest', async () => {
      const t1 = createMockTransformer('t1', {
        normalizeRequest: mock(async (req: StandardRequest) => ({ ...req, normalized: true } as StandardRequest)),
      });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      await chain.adapt({ model: 'test' } as StandardRequest, ctx);

      const adaptCall = (t1.adaptRequest as unknown as { mock: { calls: unknown[][] } }).mock.calls[0];
      expect(adaptCall[0]).toEqual({ model: 'test', normalized: true });
      expect(adaptCall[1]).toBe(ctx);
    });

    it('throws "No adapter found in chain" when no adaptRequest exists', async () => {
      const t1 = createMockTransformer('t1', { adaptRequest: undefined });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      await expect(chain.adapt({ model: 'test' } as StandardRequest, ctx)).rejects.toThrow('No adapter found in chain');
    });

    it('re-throws normalizeRequest error during adapt', async () => {
      const t1 = createMockTransformer('t1', {
        normalizeRequest: mock(async () => {
          throw new Error('normalize error');
        }),
      });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      await expect(chain.adapt({ model: 'test' } as StandardRequest, ctx)).rejects.toThrow('normalize error');
    });

    it('re-throws adaptRequest error', async () => {
      const t1 = createMockTransformer('t1', {
        adaptRequest: mock(async () => {
          throw new Error('adapt error');
        }),
      });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      await expect(chain.adapt({ model: 'test' } as StandardRequest, ctx)).rejects.toThrow('adapt error');
    });
  });

  describe('normalizeResponse', () => {
    it('short-circuits on first transformer with normalizeResponse', async () => {
      const t1 = createMockTransformer('t1');
      const t2 = createMockTransformer('t2');
      getTransformerMock.mockImplementation((name: string) => {
        if (name === 't1') return t1;
        if (name === 't2') return t2;
        return undefined;
      });

      const chain = new TransformerChain(['t1', 't2'], 'response');
      const ctx = createContext();
      const response = new Response('body');
      const result = await chain.normalizeResponse(response, ctx);

      expect(t1.normalizeResponse).toHaveBeenCalledTimes(1);
      expect(t2.normalizeResponse).not.toHaveBeenCalled();
      expect(result.metadata.transformers).toEqual(['t1']);
    });

    it('throws when no transformer has normalizeResponse', async () => {
      const t1 = createMockTransformer('t1', { normalizeResponse: undefined });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'response');
      const ctx = createContext();
      await expect(chain.normalizeResponse(new Response('body'), ctx)).rejects.toThrow('No response normalizer found in chain');
    });

    it('re-throws transformer error', async () => {
      const t1 = createMockTransformer('t1', {
        normalizeResponse: mock(async () => {
          throw new Error('normalizeResponse error');
        }),
      });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'response');
      const ctx = createContext();
      await expect(chain.normalizeResponse(new Response('body'), ctx)).rejects.toThrow('normalizeResponse error');
    });
  });

  describe('adaptResponse', () => {
    it('short-circuits on first transformer with adaptResponse', async () => {
      const t1 = createMockTransformer('t1');
      const t2 = createMockTransformer('t2');
      getTransformerMock.mockImplementation((name: string) => {
        if (name === 't1') return t1;
        if (name === 't2') return t2;
        return undefined;
      });

      const chain = new TransformerChain(['t1', 't2'], 'response');
      const ctx = createContext();
      const result = await chain.adaptResponse({ status: 200 } as unknown as StandardResponse, ctx);

      expect(t1.adaptResponse).toHaveBeenCalledTimes(1);
      expect(t2.adaptResponse).not.toHaveBeenCalled();
      expect(result.metadata.transformers).toEqual(['t1']);
    });

    it('throws when no transformer has adaptResponse', async () => {
      const t1 = createMockTransformer('t1', { adaptResponse: undefined });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'response');
      const ctx = createContext();
      await expect(chain.adaptResponse({ status: 200 } as unknown as StandardResponse, ctx)).rejects.toThrow('No response adapter found in chain');
    });

    it('re-throws transformer error', async () => {
      const t1 = createMockTransformer('t1', {
        adaptResponse: mock(async () => {
          throw new Error('adaptResponse error');
        }),
      });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'response');
      const ctx = createContext();
      await expect(chain.adaptResponse({ status: 200 } as unknown as StandardResponse, ctx)).rejects.toThrow('adaptResponse error');
    });
  });

  describe('transformStream', () => {
    it('pipes through all transformers with transformStream', async () => {
      const t1 = createStreamTransformingTransformer('t1', (text) => text + '-A');
      const t2 = createStreamTransformingTransformer('t2', (text) => text + '-B');
      getTransformerMock.mockImplementation((name: string) => {
        if (name === 't1') return t1;
        if (name === 't2') return t2;
        return undefined;
      });

      const chain = new TransformerChain(['t1', 't2'], 'request');
      const ctx = createContext();
      const stream = createStringStream('hello');
      const result = await chain.transformStream(stream, ctx);

      const content = await readStream(result);
      expect(content).toBe('hello-A-B');
      expect(t1.transformStream).toHaveBeenCalledTimes(1);
      expect(t2.transformStream).toHaveBeenCalledTimes(1);
    });

    it('passes through unchanged if no transformer has transformStream', async () => {
      const t1 = createMockTransformer('t1', { transformStream: undefined });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      const stream = createStringStream('hello');
      const result = await chain.transformStream(stream, ctx);

      const content = await readStream(result);
      expect(content).toBe('hello');
    });

    it('re-throws transformer error', async () => {
      const t1 = createMockTransformer('t1', {
        transformStream: mock(async () => {
          throw new Error('stream error');
        }),
      });
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      const stream = createStringStream('hello');
      await expect(chain.transformStream(stream, ctx)).rejects.toThrow('stream error');
    });
  });

  describe('static factories', () => {
    it('forNormalization creates a request chain', () => {
      const chain = TransformerChain.forNormalization(['t1']);
      expect(chain).toBeInstanceOf(TransformerChain);
    });

    it('forAdaptation creates a request chain', () => {
      const chain = TransformerChain.forAdaptation(['t1']);
      expect(chain).toBeInstanceOf(TransformerChain);
    });
  });

  describe('buildRequestChain', () => {
    it('creates correct ingress and egress chains', () => {
      const chains = buildRequestChain(['ingress-t'], ['egress-t']);
      expect(chains.ingress).toBeInstanceOf(TransformerChain);
      expect(chains.egress).toBeInstanceOf(TransformerChain);
    });
  });

  describe('buildResponseChain', () => {
    it('creates correct ingress and egress chains', () => {
      const chains = buildResponseChain(['ingress-t'], ['egress-t']);
      expect(chains.ingress).toBeInstanceOf(TransformerChain);
      expect(chains.egress).toBeInstanceOf(TransformerChain);
    });
  });

  describe('metadata shape', () => {
    it('includes transformers array and duration number', async () => {
      const t1 = createMockTransformer('t1');
      getTransformerMock.mockReturnValue(t1);

      const chain = new TransformerChain(['t1'], 'request');
      const ctx = createContext();
      const result = await chain.normalize({ value: 1 }, ctx);

      expect(Array.isArray(result.metadata.transformers)).toBe(true);
      expect(typeof result.metadata.duration).toBe('number');
    });
  });
});
