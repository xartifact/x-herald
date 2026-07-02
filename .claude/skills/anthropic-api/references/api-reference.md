# API Reference

Complete parameter documentation for the Anthropic Messages API.

## Table of Contents

1. [Request Parameters](#request-parameters)
2. [Response Structure](#response-structure)
3. [Error Handling](#error-handling)
4. [Rate Limits](#rate-limits)
5. [Model Information](#model-information)

## Request Parameters

### Required Parameters

#### model (string)

The model to use for generation.

**Available models:**

- `claude-opus-4-5-20251101` - Most capable, best for complex tasks
- `claude-sonnet-4-5-20250929` - Balanced performance and speed
- `claude-3-5-haiku-20241022` - Fast and cost-effective

```typescript
model: 'claude-sonnet-4-5-20250929'
```

#### max_tokens (integer)

Maximum number of tokens to generate. **Required, no default value.**

**Recommendations:**

- Short responses: 256-512
- Medium responses: 1024-2048
- Long responses: 4096+
- Maximum: Model-dependent (typically 4096-8192)

```typescript
max_tokens: 1024
```

#### messages (array)

Array of message objects representing the conversation.

**Structure:**

```typescript
messages: [
  {
    role: 'user' | 'assistant',
    content: string | ContentBlock[]
  }
]
```

**Rules:**

- Must start with a `user` message
- Roles must alternate (user → assistant → user → ...)
- Content can be string or array of content blocks

**Content block types:**

```typescript
// Text content
{ type: 'text', text: 'Hello' }

// Image content (vision models)
{
  type: 'image',
  source: {
    type: 'base64',
    media_type: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
    data: 'base64_encoded_image'
  }
}

// Tool result
{
  type: 'tool_result',
  tool_use_id: 'toolu_xxx',
  content: 'Tool execution result'
}
```

### Optional Parameters

#### system (string | array)

System prompt for instructions and context. Preferred over putting instructions in user messages.

```typescript
// Simple string
system: 'You are a helpful coding assistant.'

// Array with caching (beta)
system: [
  {
    type: 'text',
    text: 'You are a helpful assistant.',
    cache_control: { type: 'ephemeral' },
  },
]
```

#### temperature (number)

Controls randomness. Range: 0.0 to 1.0. Default: 1.0.

- **0.0**: Deterministic, focused
- **0.5**: Balanced
- **1.0**: Creative, diverse

```typescript
temperature: 0.7
```

#### top_p (number)

Nucleus sampling. Range: 0.0 to 1.0. Alternative to temperature.

```typescript
top_p: 0.9
```

**Note:** Use either `temperature` or `top_p`, not both.

#### top_k (integer)

Only sample from top K options. Range: 1 to model maximum.

```typescript
top_k: 40
```

#### stop_sequences (array)

Array of strings that will stop generation when encountered.

```typescript
stop_sequences: ['\n\nHuman:', '###', 'END']
```

**Limits:**

- Maximum 4 stop sequences
- Each sequence max 64 characters

#### stream (boolean)

Enable streaming responses. Default: false.

```typescript
stream: true
```

#### tools (array)

Array of tool definitions for function calling.

```typescript
tools: [
  {
    name: 'tool_name',
    description: 'What the tool does',
    input_schema: {
      type: 'object',
      properties: {
        param1: { type: 'string', description: 'Parameter description' },
      },
      required: ['param1'],
    },
  },
]
```

**Limits:**

- Maximum 64 tools per request
- Tool names must be alphanumeric with underscores

#### tool_choice (object)

Control tool selection behavior.

```typescript
// Let Claude decide (default)
tool_choice: { type: 'auto' }

// Force specific tool
tool_choice: { type: 'tool', name: 'get_weather' }

// Require any tool
tool_choice: { type: 'any' }

// Disable tools for this turn
tool_choice: { type: 'none' }
```

#### metadata (object)

Metadata to associate with the request.

```typescript
metadata: {
  user_id: 'user_123'
}
```

## Response Structure

### Message Object

```typescript
{
  id: string;                    // Unique message ID
  type: 'message';               // Always 'message'
  role: 'assistant';             // Always 'assistant'
  content: ContentBlock[];       // Array of content blocks
  model: string;                 // Model used
  stop_reason: StopReason;       // Why generation stopped
  stop_sequence: string | null;  // Stop sequence matched (if any)
  usage: Usage;                  // Token usage
}
```

### Content Blocks

#### Text Block

```typescript
{
  type: 'text',
  text: string
}
```

#### Tool Use Block

```typescript
{
  type: 'tool_use',
  id: string,           // Unique tool use ID
  name: string,         // Tool name
  input: object         // Tool input parameters
}
```

### Stop Reasons

- `end_turn` - Natural completion
- `max_tokens` - Reached max_tokens limit
- `stop_sequence` - Hit a stop sequence
- `tool_use` - Claude wants to use a tool

### Usage Object

```typescript
{
  input_tokens: number,   // Tokens in prompt
  output_tokens: number   // Tokens generated
}
```

**Cost calculation:**

```typescript
const inputCost = (usage.input_tokens * MODEL_INPUT_PRICE_PER_1K) / 1000
const outputCost = (usage.output_tokens * MODEL_OUTPUT_PRICE_PER_1K) / 1000
const totalCost = inputCost + outputCost
```

## Error Handling

### Error Types

#### APIError

Base class for all API errors.

```typescript
try {
  const message = await client.messages.create({...});
} catch (error) {
  if (error instanceof Anthropic.APIError) {
    console.error('Status:', error.status);
    console.error('Message:', error.message);
    console.error('Type:', error.type);
  }
}
```

#### Specific Error Types

```typescript
// 400 - Invalid request
if (error instanceof Anthropic.BadRequestError) {
  // Check request parameters
}

// 401 - Invalid API key
if (error instanceof Anthropic.AuthenticationError) {
  // Check API key
}

// 403 - Permission denied
if (error instanceof Anthropic.PermissionDeniedError) {
  // Check account permissions
}

// 404 - Resource not found
if (error instanceof Anthropic.NotFoundError) {
  // Check resource ID
}

// 429 - Rate limit exceeded
if (error instanceof Anthropic.RateLimitError) {
  // Implement backoff
}

// 500 - Server error
if (error instanceof Anthropic.InternalServerError) {
  // Retry with backoff
}
```

### Retry Strategy

```typescript
async function createMessageWithRetry(
  params: Anthropic.MessageCreateParams,
  maxRetries = 3,
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await client.messages.create(params)
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        // Exponential backoff
        const delay = Math.pow(2, attempt) * 1000
        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      if (error instanceof Anthropic.InternalServerError && attempt < maxRetries - 1) {
        // Retry server errors
        await new Promise((resolve) => setTimeout(resolve, 1000))
        continue
      }

      // Don't retry other errors
      throw error
    }
  }

  throw new Error('Max retries exceeded')
}
```

## Rate Limits

### Limits by Tier

Rate limits vary by account tier and model:

**Requests per minute (RPM):**

- Free tier: 5 RPM
- Build tier: 50 RPM
- Scale tier: 1000+ RPM

**Tokens per minute (TPM):**

- Varies by model and tier
- Check response headers for current limits

### Rate Limit Headers

```typescript
const response = await client.messages.create({...});

// Check headers (if available)
console.log('Limit:', response.headers['anthropic-ratelimit-requests-limit']);
console.log('Remaining:', response.headers['anthropic-ratelimit-requests-remaining']);
console.log('Reset:', response.headers['anthropic-ratelimit-requests-reset']);
```

### Handling Rate Limits

```typescript
async function createMessageWithRateLimit(
  params: Anthropic.MessageCreateParams,
): Promise<Anthropic.Message> {
  try {
    return await client.messages.create(params)
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      // Parse retry-after header
      const retryAfter = error.headers?.['retry-after']
      const delay = retryAfter ? parseInt(retryAfter) * 1000 : 60000

      console.log(`Rate limited. Retrying after ${delay}ms`)
      await new Promise((resolve) => setTimeout(resolve, delay))

      return await client.messages.create(params)
    }
    throw error
  }
}
```

## Model Information

### Model Capabilities

| Model      | Context Window | Max Output | Vision | Tool Use | Speed  | Cost   |
| ---------- | -------------- | ---------- | ------ | -------- | ------ | ------ |
| Opus 4.5   | 200K           | 4096       | ✅     | ✅       | Slow   | High   |
| Sonnet 4.5 | 200K           | 4096       | ✅     | ✅       | Medium | Medium |
| Haiku 3.5  | 200K           | 4096       | ✅     | ✅       | Fast   | Low    |

### Model Selection Guide

**Use Opus 4.5 for:**

- Complex reasoning tasks
- Code generation and review
- Research and analysis
- Creative writing

**Use Sonnet 4.5 for:**

- General-purpose tasks
- Balanced performance/cost
- Production applications
- Most use cases

**Use Haiku 3.5 for:**

- Simple tasks
- High-volume applications
- Cost-sensitive scenarios
- Fast response requirements

### Context Window Management

```typescript
// Count tokens before request
const tokenCount = await client.messages.countTokens({
  model: 'claude-sonnet-4-5-20250929',
  messages: messages,
  system: systemPrompt,
})

console.log('Input tokens:', tokenCount.input_tokens)

// Check if within limits
const MAX_CONTEXT = 200000
if (tokenCount.input_tokens > MAX_CONTEXT - max_tokens) {
  // Truncate or summarize messages
  messages = truncateMessages(messages, MAX_CONTEXT - max_tokens)
}
```

## Best Practices

### 1. Always Set max_tokens

```typescript
// Bad - will error
const message = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  messages: [{ role: 'user', content: 'Hello' }],
})

// Good
const message = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
})
```

### 2. Use System Prompts

```typescript
// Less effective
messages: [
  { role: 'user', content: 'You are a helpful assistant. What is 2+2?' }
]

// More effective
system: 'You are a helpful assistant.',
messages: [
  { role: 'user', content: 'What is 2+2?' }
]
```

### 3. Monitor Token Usage

```typescript
const message = await client.messages.create({...});

console.log('Tokens used:', message.usage.input_tokens + message.usage.output_tokens);

// Track costs
const cost = calculateCost(message.usage, 'claude-sonnet-4-5-20250929');
console.log('Request cost:', cost);
```

### 4. Handle All Stop Reasons

```typescript
const message = await client.messages.create({...});

switch (message.stop_reason) {
  case 'end_turn':
    // Normal completion
    break;
  case 'max_tokens':
    // Response was cut off - consider increasing max_tokens
    console.warn('Response truncated');
    break;
  case 'stop_sequence':
    // Hit a stop sequence
    break;
  case 'tool_use':
    // Claude wants to use a tool
    handleToolUse(message);
    break;
}
```

### 5. Implement Proper Error Handling

```typescript
try {
  const message = await client.messages.create({...});
} catch (error) {
  if (error instanceof Anthropic.APIError) {
    // Log error details
    console.error('API Error:', {
      status: error.status,
      type: error.type,
      message: error.message
    });

    // Handle specific errors
    if (error instanceof Anthropic.RateLimitError) {
      // Implement backoff
    }
  } else {
    // Handle non-API errors
    console.error('Unexpected error:', error);
  }
}
```
