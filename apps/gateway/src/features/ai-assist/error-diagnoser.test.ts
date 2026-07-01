import { describe, it, expect, mock, beforeEach, afterAll } from 'bun:test';

const realDbClient = await import('../../db/client');
const originalGetDatabase = realDbClient.getDatabase;
const realAiCaller = await import('../../lib/ai-caller');

let queryIndex = 0;
let queryResponses: unknown[][] = [];

const mockDb = {
  select: mock(() => mockDb),
  from: mock(() => mockDb),
  where: mock(() => mockDb),
  limit: mock(() => {
    const response = queryResponses[queryIndex] ?? [];
    queryIndex++;
    return Promise.resolve(response);
  }),
  innerJoin: mock(() => mockDb),
  orderBy: mock(() => mockDb),
};

let mockCallAIResponse: { content: string } = { content: '' };
const mockCallAI = mock(async () => mockCallAIResponse);

mock.module('../../db/client', () => ({
  getDatabase: mock(() => mockDb),
}));

mock.module('../../lib/ai-caller', () => ({
  callAI: mockCallAI,
}));

const { ErrorDiagnoser } = await import('./error-diagnoser');

afterAll(() => {
  mock.module('../../db/client', () => ({
    getDatabase: originalGetDatabase,
    closeDatabase: realDbClient.closeDatabase,
    createDatabase: realDbClient.createDatabase,
    schema: realDbClient.schema,
  }));
  mock.module('../../lib/ai-caller', () => realAiCaller);
});

describe('ErrorDiagnoser', () => {
  beforeEach(() => {
    queryIndex = 0;
    queryResponses = [];
    mockCallAIResponse = { content: '' };
    mockCallAI.mockClear();
  });

  describe('parseDiagnosis', () => {
    it('Valid JSON with all fields → correct parsed result', () => {
      const diagnoser = new ErrorDiagnoser();
      const result = (diagnoser as unknown as { parseDiagnosis: (s: string) => Record<string, unknown> }).parseDiagnosis(
        JSON.stringify({
          rootCause: 'test root cause',
          errorCategory: 'param_error',
          suggestions: [
            {
              action: 'update_config',
              field: 'temperature',
              value: 0.5,
              reason: 'too high',
              autoApplicable: true,
            },
          ],
          confidence: 0.8,
        })
      );
      expect(result).toEqual({
        rootCause: 'test root cause',
        errorCategory: 'param_error',
        suggestions: [
          {
            action: 'update_config',
            field: 'temperature',
            value: 0.5,
            reason: 'too high',
            autoApplicable: true,
          },
        ],
        confidence: 0.8,
      });
    });

    it('Invalid JSON → fallback result', () => {
      const diagnoser = new ErrorDiagnoser();
      const result = (diagnoser as unknown as { parseDiagnosis: (s: string) => Record<string, unknown> }).parseDiagnosis(
        'not valid json {{'
      );
      expect(result).toEqual({
        rootCause: '无法解析 AI 诊断结果',
        errorCategory: 'unknown',
        suggestions: [],
        confidence: 0,
      });
    });

    it('Bad category → defaults to unknown', () => {
      const diagnoser = new ErrorDiagnoser();
      const result = (diagnoser as unknown as { parseDiagnosis: (s: string) => Record<string, unknown> }).parseDiagnosis(
        JSON.stringify({
          rootCause: 'test',
          errorCategory: 'bad_category',
          suggestions: [],
          confidence: 0.5,
        })
      );
      expect(result.errorCategory).toBe('unknown');
    });

    it('Bad suggestion action → filtered out', () => {
      const diagnoser = new ErrorDiagnoser();
      const result = (diagnoser as unknown as { parseDiagnosis: (s: string) => Record<string, unknown> }).parseDiagnosis(
        JSON.stringify({
          rootCause: 'test',
          errorCategory: 'param_error',
          suggestions: [
            {
              action: 'bad_action',
              field: 'test',
              reason: 'r',
              autoApplicable: true,
            },
          ],
          confidence: 0.5,
        })
      );
      expect(result.suggestions).toEqual([]);
    });

    it('Confidence > 1 → clamped to 1', () => {
      const diagnoser = new ErrorDiagnoser();
      const result = (diagnoser as unknown as { parseDiagnosis: (s: string) => Record<string, unknown> }).parseDiagnosis(
        JSON.stringify({
          rootCause: 'test',
          errorCategory: 'param_error',
          suggestions: [],
          confidence: 1.5,
        })
      );
      expect(result.confidence).toBe(1);
    });

    it('Confidence < 0 → clamped to 0', () => {
      const diagnoser = new ErrorDiagnoser();
      const result = (diagnoser as unknown as { parseDiagnosis: (s: string) => Record<string, unknown> }).parseDiagnosis(
        JSON.stringify({
          rootCause: 'test',
          errorCategory: 'param_error',
          suggestions: [],
          confidence: -0.5,
        })
      );
      expect(result.confidence).toBe(0);
    });

    it('Mixed valid + invalid suggestions → only valid ones returned', () => {
      const diagnoser = new ErrorDiagnoser();
      const result = (diagnoser as unknown as { parseDiagnosis: (s: string) => Record<string, unknown> }).parseDiagnosis(
        JSON.stringify({
          rootCause: 'test',
          errorCategory: 'param_error',
          suggestions: [
            {
              action: 'update_config',
              field: 'f1',
              reason: 'r1',
              autoApplicable: true,
            },
            {
              action: 'bad_action',
              field: 'f2',
              reason: 'r2',
              autoApplicable: false,
            },
          ],
          confidence: 0.5,
        })
      );
      expect(result.suggestions).toHaveLength(1);
      expect((result.suggestions as Array<Record<string, unknown>>)[0].action).toBe('update_config');
    });
  });

  describe('diagnose', () => {
    it('Log not found → throws "Log not found"', async () => {
      const diagnoser = new ErrorDiagnoser();
      queryResponses = [[]]; // requestLogs returns empty
      await expect(diagnoser.diagnose('nonexistent-log')).rejects.toThrow('Log not found');
    });

    it('Successful diagnosis → returns parsed result', async () => {
      const diagnoser = new ErrorDiagnoser();
      queryResponses = [
        [
          {
            id: 'log-1',
            statusCode: 429,
            errorMessage: 'Rate limit exceeded',
            errorType: 'rate_limit',
            providerName: 'OpenAI',
            modelName: 'gpt-4',
            requestBody: { model: 'gpt-4' },
            responseBody: { error: 'Rate limit' },
            metadata: { routing: { instanceId: 'inst-1' } },
          },
        ],
        [
          {
            instanceId: 'inst-1',
            providerResponseBody: { error: 'Rate limit' },
          },
        ],
        [
          {
            config: { retryConfig: { maxRetries: 3 } },
          },
        ],
      ];
      mockCallAIResponse = {
        content: JSON.stringify({
          rootCause: 'Rate limit',
          errorCategory: 'rate_limit',
          suggestions: [
            {
              action: 'update_config',
              field: 'retryConfig.maxRetries',
              value: 5,
              reason: 'Increase retries',
              autoApplicable: true,
            },
          ],
          confidence: 0.9,
        }),
      };
      const result = await diagnoser.diagnose('log-1');
      expect(result.rootCause).toBe('Rate limit');
      expect(result.errorCategory).toBe('rate_limit');
      expect(result.suggestions).toHaveLength(1);
      expect(result.confidence).toBe(0.9);
      expect(result.instanceId).toBe('inst-1');
    });
  });
});
