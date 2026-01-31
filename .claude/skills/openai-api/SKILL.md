---
name: openai-api
description: OpenAI HTTP API Protocol format specification and implementation guide. Use when working with OpenAI API integration, implementing chat completions, streaming responses (SSE), tool use (function calling), or building OpenAI-compatible API endpoints. Covers request/response formats, Server-Sent Events streaming, and protocol conversion.
---

# OpenAI API Skill

This skill provides guidance for integrating with the OpenAI HTTP API and building OpenAI-compatible endpoints.

## Quick Start

### Basic Chat Completion

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [
      { role: 'user', content: 'Hello!' }
    ],
    max_tokens: 1024,
  }),
});

const data = await response.json();
console.log(data.choices[0].message.content);
```

### Key Concepts

**Required Parameters:**
- `model`: Model identifier (e.g., 'gpt-4o', 'gpt-4o-mini')
- `messages`: Array of message objects with `role` ('system'/'developer', 'user', 'assistant', 'tool') and `content`

**Optional Parameters:**
- `max_tokens`: Maximum tokens to generate
- `temperature`: Sampling randomness (0-2, default 1)
- `top_p`: Nucleus sampling (0-1)
- `stream`: Enable SSE streaming (boolean)
- `tools`: Array of tool definitions for function calling
- `tool_choice`: Control tool calling behavior
- `response_format`: Force JSON output
- `stop`: Stop sequences

## Common Workflows

### 1. Non-Streaming Request/Response

**Request:**
```http
POST /v1/chat/completions
Content-Type: application/json
Authorization: Bearer {api_key}

{
  "model": "gpt-4o",
  "messages": [
    { "role": "user", "content": "What is 2+2?" }
  ],
  "temperature": 0.7,
  "max_tokens": 150
}
```

**Response:**
```json
{
  "id": "chatcmpl-123",
  "object": "chat.completion",
  "created": 1677652288,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "2+2 equals 4."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 6,
    "total_tokens": 18
  }
}
```

### 2. Streaming with SSE

Enable streaming for real-time output:

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Write a haiku' }],
    stream: true,  // Enable streaming
  }),
});

const reader = response.body?.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader!.read();
  if (done) break;

  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');

  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = line.slice(6);
      if (data === '[DONE]') break;

      const event = JSON.parse(data);
      const content = event.choices[0]?.delta?.content;
      if (content) process.stdout.write(content);
    }
  }
}
```

**See [STREAMING.md](references/streaming.md) for detailed SSE format.**

### 3. Tool Use (Function Calling)

Define tools for the model to call:

```typescript
const tools = [
  {
    type: 'function',
    function: {
      name: 'get_weather',
      description: 'Get weather for a location',
      parameters: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City and state, e.g., San Francisco, CA'
          },
          unit: {
            type: 'string',
            enum: ['celsius', 'fahrenheit']
          }
        },
        required: ['location']
      }
    }
  }
];

const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'What is the weather in SF?' }],
    tools,
    tool_choice: 'auto',
  }),
});

const data = await response.json();

// Check if model wants to use a tool
if (data.choices[0].finish_reason === 'tool_calls') {
  const toolCall = data.choices[0].message.tool_calls[0];
  const functionName = toolCall.function.name;
  const functionArgs = JSON.parse(toolCall.function.arguments);

  // Execute the function
  const result = await executeFunction(functionName, functionArgs);

  // Send the result back
  const finalResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o',
      messages: [
        { role: 'user', content: 'What is the weather in SF?' },
        { role: 'assistant', content: null, tool_calls: [toolCall] },
        {
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(result)
        }
      ],
      tools,
    }),
  });
}
```

### 4. JSON Mode

Force JSON output:

```typescript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`,
  },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: 'You are a helpful assistant that outputs JSON.'
      },
      {
        role: 'user',
        content: 'List 3 popular programming languages'
      }
    ],
    response_format: { type: 'json_object' },
  }),
});
```

## Message Format

### Message Roles

- `system` or `developer`: System instructions (behavior, context)
- `user`: User input
- `assistant`: Model responses
- `tool`: Tool execution results

### Message Content Types

**Text-only:**
```json
{
  "role": "user",
  "content": "Hello!"
}
```

**Multi-modal (text + images):**
```json
{
  "role": "user",
  "content": [
    { "type": "text", "text": "What's in this image?" },
    {
      "type": "image_url",
      "image_url": {
        "url": "https://example.com/image.jpg"
      }
    }
  ]
}
```

**Tool calls:**
```json
{
  "role": "assistant",
  "content": null,
  "tool_calls": [
    {
      "id": "call_123",
      "type": "function",
      "function": {
        "name": "get_weather",
        "arguments": "{\"location\": \"San Francisco\"}"
      }
    }
  ]
}
```

**Tool results:**
```json
{
  "role": "tool",
  "tool_call_id": "call_123",
  "content": "{\"temperature\": 72, \"unit\": \"fahrenheit\"}"
}
```

## Response Structure

### Non-Streaming Response

```typescript
interface ChatCompletionResponse {
  id: string;                    // Unique identifier
  object: 'chat.completion';
  created: number;               // Unix timestamp
  model: string;                 // Model used
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: 'function';
        function: {
          name: string;
          arguments: string;
        };
      }>;
    };
    finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  }>;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}
```

### Streaming Chunk

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
  }>;
}
```

## Error Handling

### HTTP Error Codes

- `400` Bad Request: Invalid request body
- `401` Unauthorized: Invalid API key
- `429` Rate Limit: Too many requests
- `500` Internal Server Error: OpenAI server error

### Error Response Format

```json
{
  "error": {
    "message": "Invalid request",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found"
  }
}
```

### Retry Logic

```typescript
async function requestWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3
): Promise<Response> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const response = await fetch(url, options);

    if (response.ok) return response;

    if (response.status === 429 || response.status >= 500) {
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }

    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  throw new Error('Max retries exceeded');
}
```

## Best Practices

1. **Always handle streaming**: Use streaming for better UX in interactive applications
2. **Validate tool inputs**: Always validate function arguments before execution
3. **Monitor usage**: Track tokens for cost management
4. **Set appropriate max_tokens**: Prevent unexpectedly long responses
5. **Use system prompts**: Put instructions in system messages, not user messages
6. **Handle rate limits**: Implement exponential backoff
7. **Parse JSON carefully**: Tool arguments are JSON strings, parse them safely

## Available Models

- `gpt-4o` - Most capable multimodal model
- `gpt-4o-mini` - Fast and cost-effective
- `gpt-4-turbo` - Previous generation
- `gpt-3.5-turbo` - Legacy model

## Additional Resources

- **[HTTP-API.md](references/http-api.md)** - Complete HTTP API reference
- **[STREAMING.md](references/streaming.md)** - SSE streaming details

## Common Errors

- **Missing model**: Required parameter
- **Invalid message format**: Messages must start with user or system
- **Tool call format**: Must include `tool_calls` array with proper structure
- **Streaming parse errors**: Handle partial JSON in stream chunks
- **Rate limiting**: Implement proper backoff strategy
