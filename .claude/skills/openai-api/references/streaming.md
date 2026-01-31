# OpenAI Streaming (SSE) Reference

Server-Sent Events (SSE) format for OpenAI streaming responses.

## Table of Contents

1. [Overview](#overview)
2. [SSE Format](#sse-format)
3. [Event Types](#event-types)
4. [Implementation](#implementation)
5. [Best Practices](#best-practices)

## Overview

When `stream: true` is set in the request, OpenAI returns a stream of Server-Sent Events (SSE) instead of a single JSON response.

**Request:**
```json
{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```

**Response Headers:**
```http
Content-Type: text/event-stream
Cache-Control: no-cache
Connection: keep-alive
```

## SSE Format

### Format Specification

```
data: {"id":"...","object":"chat.completion.chunk",...}

data: {"id":"...","object":"chat.completion.chunk",...}

data: [DONE]

```

Each event:
- Starts with `data: `
- Contains JSON payload
- Ends with double newline (`\n\n`)
- Final event is `data: [DONE]`

### Chunk Structure

```typescript
interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: 'function';
        function?: {
          name?: string;
          arguments?: string;
        };
      }>;
    };
    finish_reason: string | null;
    logprobs?: object;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

## Event Types

### 1. Role Event

First chunk contains the role:

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion.chunk",
  "created": 1677858242,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "delta": {
        "role": "assistant"
      },
      "finish_reason": null
    }
  ]
}
```

### 2. Content Events

Subsequent chunks contain content fragments:

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion.chunk",
  "created": 1677858242,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "delta": {
        "content": "Hello"
      },
      "finish_reason": null
    }
  ]
}
```

Content accumulates across chunks:
```
Chunk 1: {"delta": {"content": "Hello"}}
Chunk 2: {"delta": {"content": " there"}}
Chunk 3: {"delta": {"content": "!"}}
Final: "Hello there!"
```

### 3. Tool Call Events

For function calling, chunks contain tool call fragments:

**Tool call start:**
```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion.chunk",
  "created": 1677858242,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "delta": {
        "tool_calls": [
          {
            "index": 0,
            "id": "call_123",
            "type": "function",
            "function": {
              "name": "get_weather",
              "arguments": ""
            }
          }
        ]
      },
      "finish_reason": null
    }
  ]
}
```

**Tool call arguments (spread across chunks):**
```json
{
  "choices": [
    {
      "delta": {
        "tool_calls": [
          {
            "index": 0,
            "function": {
              "arguments": '{"lo'
            }
          }
        ]
      }
    }
  ]
}
```

```json
{
  "choices": [
    {
      "delta": {
        "tool_calls": [
          {
            "index": 0,
            "function": {
              "arguments": 'cation":'
            }
          }
        ]
      }
    }
  ]
}
```

### 4. Finish Event

Last chunk before [DONE] contains finish_reason:

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion.chunk",
  "created": 1677858242,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "delta": {},
      "finish_reason": "stop"
    }
  ]
}
```

### 5. Completion Event

Stream ends with:

```
data: [DONE]

```

## Implementation

### Browser (Fetch API)

```typescript
async function streamChatCompletion(messages: Message[]) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages,
      stream: true,
    }),
  });

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader!.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') {
          console.log('Stream complete');
          return;
        }

        try {
          const chunk = JSON.parse(data);
          const content = chunk.choices[0]?.delta?.content;
          if (content) {
            process.stdout.write(content);
          }
        } catch (error) {
          console.error('Parse error:', error);
        }
      }
    }
  }
}
```

### Node.js

```typescript
import { Readable } from 'stream';

async function* streamChunks(response: Response): AsyncGenerator<ChatCompletionChunk> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const data = line.slice(6);
        if (data === '[DONE]') continue;

        yield JSON.parse(data);
      }
    }
  }
}

// Usage
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ model: 'gpt-4o', messages, stream: true }),
});

for await (const chunk of streamChunks(response)) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) process.stdout.write(content);
}
```

### Express.js Server (SSE Endpoint)

```typescript
import express from 'express';

app.post('/api/chat', async (req, res) => {
  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: req.body.messages,
      stream: true,
    }),
  });

  const reader = response.body!.getReader();
  const decoder = new TextDecoder();

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      res.write(chunk); // Forward SSE events
    }
  } finally {
    res.end();
  }
});
```

### React Hook

```typescript
import { useState, useCallback } from 'react';

export function useChatStream() {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  const sendMessage = useCallback(async (messages: Message[]) => {
    setIsStreaming(true);
    setText('');

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            const chunk = JSON.parse(data);
            const content = chunk.choices[0]?.delta?.content;
            if (content) {
              setText(prev => prev + content);
            }
          }
        }
      }
    } finally {
      setIsStreaming(false);
    }
  }, []);

  return { text, isStreaming, sendMessage };
}
```

## Best Practices

### 1. Buffer Management

Always handle partial events in the buffer:

```typescript
let buffer = '';

// Incoming data
buffer += decoder.decode(value, { stream: true });
const lines = buffer.split('\n');
buffer = lines.pop() || ''; // Keep incomplete line in buffer

// Process complete lines
for (const line of lines) {
  // ...
}
```

### 2. Error Handling

Handle parse errors gracefully:

```typescript
try {
  const chunk = JSON.parse(data);
  // Process chunk
} catch (error) {
  console.error('Failed to parse chunk:', error);
  // Continue processing other chunks
}
```

### 3. Tool Call Accumulation

Accumulate tool call arguments across chunks:

```typescript
const toolCalls: Map<number, { id: string; name: string; args: string }> = new Map();

for await (const chunk of stream) {
  const delta = chunk.choices[0]?.delta;

  if (delta?.tool_calls) {
    for (const tc of delta.tool_calls) {
      if (!toolCalls.has(tc.index)) {
        toolCalls.set(tc.index, {
          id: tc.id!,
          name: tc.function?.name!,
          args: '',
        });
      }

      if (tc.function?.arguments) {
        toolCalls.get(tc.index)!.args += tc.function.arguments;
      }
    }
  }
}

// Parse final tool calls
for (const [index, tc] of toolCalls) {
  const args = JSON.parse(tc.args);
  console.log(`Tool ${tc.name} called with:`, args);
}
```

### 4. Abort/Cancel

Support request cancellation:

```typescript
const controller = new AbortController();

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: JSON.stringify({ model: 'gpt-4o', messages, stream: true }),
  signal: controller.signal,
});

// Cancel after 5 seconds
setTimeout(() => controller.abort(), 5000);
```

### 5. Buffering for UI Performance

For high-frequency updates, buffer before UI updates:

```typescript
let textBuffer = '';
let lastUpdate = Date.now();
const UPDATE_INTERVAL = 50; // ms

for await (const chunk of stream) {
  const content = chunk.choices[0]?.delta?.content;
  if (content) {
    textBuffer += content;

    const now = Date.now();
    if (now - lastUpdate > UPDATE_INTERVAL) {
      updateUI(textBuffer);
      textBuffer = '';
      lastUpdate = now;
    }
  }
}

// Flush remaining buffer
if (textBuffer) {
  updateUI(textBuffer);
}
```

## Complete Example

```typescript
interface StreamOptions {
  apiKey: string;
  model?: string;
  messages: Array<{ role: string; content: string }>;
  onChunk?: (text: string) => void;
  onToolCall?: (toolCall: ToolCall) => void;
  onFinish?: (reason: string) => void;
  onError?: (error: Error) => void;
}

async function streamChat({
  apiKey,
  model = 'gpt-4o',
  messages,
  onChunk,
  onToolCall,
  onFinish,
  onError,
}: StreamOptions) {
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ model, messages, stream: true }),
    });

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;

        const data = line.slice(6);
        if (data === '[DONE]') continue;

        try {
          const chunk = JSON.parse(data);
          const delta = chunk.choices[0]?.delta;
          const finishReason = chunk.choices[0]?.finish_reason;

          if (delta?.content) {
            onChunk?.(delta.content);
          }

          if (finishReason) {
            onFinish?.(finishReason);
          }
        } catch (error) {
          onError?.(error as Error);
        }
      }
    }
  } catch (error) {
    onError?.(error as Error);
  }
}
```
