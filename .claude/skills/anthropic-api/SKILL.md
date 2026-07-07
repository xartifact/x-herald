---
name: anthropic-api
description: Comprehensive guide for using the Anthropic API (Claude AI). Use when working with Claude API integration, implementing message creation, streaming responses, tool use (function calling), or batch processing. Covers request/response formats, best practices, and common patterns for TypeScript/JavaScript and Python SDKs.
---

# Anthropic API Skill

This skill provides guidance for integrating with the Anthropic API (Claude AI) in your applications.

## Quick Start

### Basic Message Creation

```typescript
import Anthropic from '@anthropic-ai/sdk'

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

const message = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello, Claude!' }],
})

console.log(message.content[0].text)
console.log('Usage:', message.usage) // { input_tokens: 10, output_tokens: 20 }
```

### Key Concepts

**Required Parameters:**

- `model`: Model identifier (e.g., 'claude-sonnet-4-5-20250929', 'claude-opus-4-5-20251101')
- `max_tokens`: Maximum tokens to generate (required, no default)
- `messages`: Array of message objects with `role` ('user' or 'assistant') and `content`

**Optional Parameters:**

- `system`: System prompt for instructions and context
- `temperature`: Randomness (0-1, default 1)
- `top_p`: Nucleus sampling (0-1)
- `stop_sequences`: Array of strings to stop generation
- `stream`: Enable streaming responses (boolean)
- `tools`: Array of tool definitions for function calling

## Common Workflows

### 1. Multi-turn Conversations

Maintain conversation history by appending messages:

```typescript
const messages: Anthropic.MessageParam[] = [
  { role: 'user', content: 'What is 2+2?' },
  { role: 'assistant', content: '2+2 equals 4.' },
  { role: 'user', content: 'What about 3+3?' },
]

const response = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages,
})
```

### 2. System Prompts

Use system prompts for instructions and context:

```typescript
const message = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  system: 'You are a helpful coding assistant. Provide concise, accurate answers.',
  messages: [{ role: 'user', content: 'How do I reverse a string in JavaScript?' }],
})
```

### 3. Streaming Responses

For real-time output, use streaming:

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a poem' }],
})

for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text)
  }
}

const finalMessage = await stream.finalMessage()
```

**See [STREAMING.md](references/streaming.md) for detailed streaming patterns.**

### 4. Tool Use (Function Calling)

Define tools for Claude to call:

```typescript
const tools: Anthropic.Tool[] = [
  {
    name: 'get_weather',
    description: 'Get weather for a location',
    input_schema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'City and state' },
        unit: { type: 'string', enum: ['celsius', 'fahrenheit'] },
      },
      required: ['location'],
    },
  },
]

const message = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What is the weather in SF?' }],
  tools,
})

// Check if Claude wants to use a tool
if (message.stop_reason === 'tool_use') {
  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  )

  // Execute tool and return result
  const toolResult = executeYourTool(toolUse.name, toolUse.input)

  const finalResponse = await client.messages.create({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [
      { role: 'user', content: 'What is the weather in SF?' },
      { role: 'assistant', content: message.content },
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: toolResult,
          },
        ],
      },
    ],
    tools,
  })
}
```

**See [TOOL-USE.md](references/tool-use.md) for comprehensive tool use patterns.**

### 5. Batch Processing

Process multiple requests efficiently:

```typescript
const batch = await client.messages.batches.create({
  requests: [
    {
      custom_id: 'request-1',
      params: {
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hello' }],
      },
    },
    {
      custom_id: 'request-2',
      params: {
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1024,
        messages: [{ role: 'user', content: 'Hi there' }],
      },
    },
  ],
})

// Poll for completion
const batchStatus = await client.messages.batches.retrieve(batch.id)

if (batchStatus.processing_status === 'ended') {
  const results = await client.messages.batches.results(batch.id)

  for await (const entry of results) {
    if (entry.result.type === 'succeeded') {
      console.log(entry.custom_id, entry.result.message.content)
    }
  }
}
```

## Response Structure

All responses include:

```typescript
{
  id: 'msg_xxx',
  type: 'message',
  role: 'assistant',
  content: [
    { type: 'text', text: 'Response text here' }
    // or { type: 'tool_use', id: 'xxx', name: 'tool_name', input: {...} }
  ],
  model: 'claude-sonnet-4-5-20250929',
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use',
  usage: {
    input_tokens: 10,
    output_tokens: 20,
  }
}
```

## Token Counting

Count tokens before making requests:

```typescript
const tokenCount = await client.messages.countTokens({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: 'Your message here' }],
})

console.log('Estimated tokens:', tokenCount.input_tokens)
```

## Best Practices

1. **Always set max_tokens**: No default value, must be specified
2. **Handle stop_reason**: Check why generation stopped (end_turn, max_tokens, tool_use)
3. **Monitor usage**: Track input_tokens and output_tokens for cost management
4. **Use system prompts**: Better than putting instructions in user messages
5. **Stream for UX**: Use streaming for better user experience in interactive apps
6. **Validate tool inputs**: Always validate tool use inputs before execution
7. **Error handling**: Wrap API calls in try-catch blocks

## Available Models

- `claude-opus-4-5-20251101` - Most capable model
- `claude-sonnet-4-5-20250929` - Balanced performance and speed
- `claude-3-5-haiku-20241022` - Fast and cost-effective

## Additional Resources

- **[API-REFERENCE.md](references/api-reference.md)** - Complete parameter documentation
- **[TOOL-USE.md](references/tool-use.md)** - Advanced tool use patterns
- **[STREAMING.md](references/streaming.md)** - Streaming implementation details

## Common Errors

- **Missing max_tokens**: Always required, no default
- **Invalid message format**: Messages must alternate user/assistant (start with user)
- **Tool result format**: Must include tool_use_id and match the tool call
- **Rate limits**: Implement exponential backoff for retries
