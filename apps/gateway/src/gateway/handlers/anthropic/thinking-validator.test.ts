import { describe, it, expect } from 'bun:test';
import {
  normalizeAnthropicPassthroughMessages,
  hasAssistantMessagesWithoutThinking,
  injectSyntheticThinkingBlocks,
} from './thinking-validator';

describe('normalizeAnthropicPassthroughMessages', () => {
  it('passes non-user messages through unchanged', () => {
    const messages = [
      { role: 'assistant', content: 'Hello' },
      { role: 'system', content: 'You are a helpful assistant' },
    ];
    const result = normalizeAnthropicPassthroughMessages(messages);
    expect(result).toEqual(messages);
  });

  it('passes user with string content through unchanged', () => {
    const messages = [{ role: 'user', content: 'Hello world' }];
    const result = normalizeAnthropicPassthroughMessages(messages);
    expect(result).toEqual(messages);
  });

  it('passes user with pure tool_result blocks through unchanged', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool-1', content: 'result' },
          { type: 'tool_result', tool_use_id: 'tool-2', content: 'result2' },
        ],
      },
    ];
    const result = normalizeAnthropicPassthroughMessages(messages);
    expect(result).toEqual(messages);
  });

  it('passes user with pure non-tool_result blocks through unchanged', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hello' },
          { type: 'image', source: 'url' },
        ],
      },
    ];
    const result = normalizeAnthropicPassthroughMessages(messages);
    expect(result).toEqual(messages);
  });

  it('splits user with mixed tool_result + non-tool_result into separate messages', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool-1', content: 'result' },
          { type: 'text', text: 'please continue' },
          { type: 'tool_result', tool_use_id: 'tool-2', content: 'result2' },
          { type: 'image', source: 'url' },
        ],
      },
    ];
    const result = normalizeAnthropicPassthroughMessages(messages);
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tool-1', content: 'result' },
        { type: 'tool_result', tool_use_id: 'tool-2', content: 'result2' },
      ],
    });
    expect(result[1]).toEqual({
      role: 'user',
      content: [
        { type: 'text', text: 'please continue' },
        { type: 'image', source: 'url' },
      ],
    });
  });

  it('returns empty array for empty messages', () => {
    const result = normalizeAnthropicPassthroughMessages([]);
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });

  it('handles multiple user messages with different mix patterns independently', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool-1', content: 'result' },
          { type: 'text', text: 'first' },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'pure text only' },
        ],
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool-2', content: 'result2' },
          { type: 'tool_result', tool_use_id: 'tool-3', content: 'result3' },
        ],
      },
      {
        role: 'assistant',
        content: 'I will help you',
      },
      {
        role: 'user',
        content: [
          { type: 'tool_result', tool_use_id: 'tool-4', content: 'result4' },
          { type: 'image', source: 'url' },
        ],
      },
    ];
    const result = normalizeAnthropicPassthroughMessages(messages);
    expect(result).toHaveLength(7);

    // First user message splits into 2
    expect(result[0]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tool-1', content: 'result' }],
    });
    expect(result[1]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'first' }],
    });

    // Second user message stays as is (pure non-tool_result)
    expect(result[2]).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'pure text only' }],
    });

    // Third user message stays as is (pure tool_result)
    expect(result[3]).toEqual({
      role: 'user',
      content: [
        { type: 'tool_result', tool_use_id: 'tool-2', content: 'result2' },
        { type: 'tool_result', tool_use_id: 'tool-3', content: 'result3' },
      ],
    });

    // Assistant message unchanged
    expect(result[4]).toEqual({ role: 'assistant', content: 'I will help you' });

    // Fifth user message splits into 2
    expect(result[5]).toEqual({
      role: 'user',
      content: [{ type: 'tool_result', tool_use_id: 'tool-4', content: 'result4' }],
    });
    expect(result[6]).toEqual({
      role: 'user',
      content: [{ type: 'image', source: 'url' }],
    });
  });
});

describe('hasAssistantMessagesWithoutThinking', () => {
  it('returns false when no assistant messages', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'system', content: 'You are helpful' },
    ];
    expect(hasAssistantMessagesWithoutThinking(messages)).toBe(false);
  });

  it('returns false for assistant with string content', () => {
    const messages = [{ role: 'assistant', content: 'I am an assistant' }];
    expect(hasAssistantMessagesWithoutThinking(messages)).toBe(false);
  });

  it('returns false for assistant with empty array content', () => {
    const messages = [{ role: 'assistant', content: [] }];
    expect(hasAssistantMessagesWithoutThinking(messages)).toBe(false);
  });

  it('returns false when assistant has thinking block', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me think...' },
          { type: 'text', text: 'Here is the answer' },
        ],
      },
    ];
    expect(hasAssistantMessagesWithoutThinking(messages)).toBe(false);
  });

  it('returns true when assistant has array content without thinking block', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Here is the answer' },
          { type: 'tool_use', id: 'tool-1', name: 'search' },
        ],
      },
    ];
    expect(hasAssistantMessagesWithoutThinking(messages)).toBe(true);
  });

  it('returns true when multiple assistants, some with thinking some without', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Let me think...' },
          { type: 'text', text: 'Answer 1' },
        ],
      },
      {
        role: 'assistant',
        content: [
          { type: 'text', text: 'Answer 2' },
        ],
      },
    ];
    expect(hasAssistantMessagesWithoutThinking(messages)).toBe(true);
  });
});

describe('injectSyntheticThinkingBlocks', () => {
  it('passes through unchanged when thinking block already present', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Already thinking' },
          { type: 'text', text: 'Answer' },
        ],
      },
    ];
    const result = injectSyntheticThinkingBlocks(messages);
    expect(result).toEqual(messages);
  });

  it('prepends synthetic thinking block when missing on assistant', () => {
    const messages = [
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Answer' }],
      },
    ];
    const result = injectSyntheticThinkingBlocks(messages);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '...' },
        { type: 'text', text: 'Answer' },
      ],
    });
  });

  it('passes non-assistant messages unchanged', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'system', content: 'You are helpful' },
      {
        role: 'user',
        content: [{ type: 'text', text: 'question' }],
      },
    ];
    const result = injectSyntheticThinkingBlocks(messages);
    expect(result).toEqual(messages);
  });

  it('only modifies assistants, leaves others untouched in mixed roles', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Answer' }],
      },
      { role: 'system', content: 'System' },
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'Already thinking' },
          { type: 'text', text: 'Answer 2' },
        ],
      },
    ];
    const result = injectSyntheticThinkingBlocks(messages);
    expect(result).toHaveLength(4);
    // user unchanged
    expect(result[0]).toEqual({ role: 'user', content: 'Hello' });
    // assistant without thinking gets synthetic block
    expect(result[1]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: '...' },
        { type: 'text', text: 'Answer' },
      ],
    });
    // system unchanged
    expect(result[2]).toEqual({ role: 'system', content: 'System' });
    // assistant with thinking unchanged
    expect(result[3]).toEqual({
      role: 'assistant',
      content: [
        { type: 'thinking', thinking: 'Already thinking' },
        { type: 'text', text: 'Answer 2' },
      ],
    });
  });

  it('returns empty array for empty messages', () => {
    const result = injectSyntheticThinkingBlocks([]);
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
  });
});
