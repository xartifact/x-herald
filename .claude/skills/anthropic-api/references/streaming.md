# Streaming Reference

This guide covers streaming responses with the Anthropic API for real-time output.

## Table of Contents

1. [Basic Streaming](#basic-streaming)
2. [Event Types](#event-types)
3. [Stream Helpers](#stream-helpers)
4. [Error Handling](#error-handling)
5. [Best Practices](#best-practices)

## Basic Streaming

### Simple Streaming

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [
    { role: 'user', content: 'Write a short story about a robot' }
  ],
});

// Iterate through stream events
for await (const event of stream) {
  if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}

// Get the complete message
const finalMessage = await stream.finalMessage();
console.log('\n\nFinal message:', finalMessage);
```

### Alternative: Raw Streaming

For more control and lower memory usage:

```typescript
const stream = await client.messages.create({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
  stream: true,
});

for await (const chunk of stream) {
  if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
    process.stdout.write(chunk.delta.text);
  }
}
```

## Event Types

Streaming responses emit various event types:

### 1. message_start

Emitted when the message begins:

```typescript
{
  type: 'message_start',
  message: {
    id: 'msg_xxx',
    type: 'message',
    role: 'assistant',
    content: [],
    model: 'claude-sonnet-4-5-20250929',
    stop_reason: null,
    usage: { input_tokens: 10, output_tokens: 0 }
  }
}
```

### 2. content_block_start

Emitted when a new content block begins:

```typescript
{
  type: 'content_block_start',
  index: 0,
  content_block: {
    type: 'text',
    text: ''
  }
}
```

### 3. content_block_delta

Emitted for each chunk of content:

```typescript
{
  type: 'content_block_delta',
  index: 0,
  delta: {
    type: 'text_delta',
    text: 'Hello'
  }
}
```

### 4. content_block_stop

Emitted when a content block ends:

```typescript
{
  type: 'content_block_stop',
  index: 0
}
```

### 5. message_delta

Emitted with usage updates and stop reason:

```typescript
{
  type: 'message_delta',
  delta: {
    stop_reason: 'end_turn',
    stop_sequence: null
  },
  usage: {
    output_tokens: 15
  }
}
```

### 6. message_stop

Emitted when the message is complete:

```typescript
{
  type: 'message_stop'
}
```

## Stream Helpers

### Event Listeners

Use event listeners for cleaner code:

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Tell me a joke' }],
});

stream
  .on('text', (text) => {
    // Emitted for each text delta
    process.stdout.write(text);
  })
  .on('contentBlock', (contentBlock) => {
    // Emitted when a content block completes
    console.log('\nContent block:', contentBlock);
  })
  .on('message', (message) => {
    // Emitted when the full message completes
    console.log('\nFull message:', message);
  })
  .on('error', (error) => {
    // Emitted on errors
    console.error('Stream error:', error);
  })
  .on('end', () => {
    // Emitted when stream ends
    console.log('\nStream ended');
  });

// Wait for completion
const finalMessage = await stream.finalMessage();
```

### Accumulating Text

```typescript
let accumulatedText = '';

const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a haiku' }],
});

stream.on('text', (text) => {
  accumulatedText += text;
  console.log('Current text:', accumulatedText);
});

await stream.finalMessage();
console.log('Final text:', accumulatedText);
```

### Cancelling Streams

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a long essay' }],
});

// Cancel after 5 seconds
setTimeout(() => {
  stream.abort();
  console.log('Stream cancelled');
}, 5000);

try {
  for await (const event of stream) {
    // Process events
  }
} catch (error) {
  if (error.name === 'AbortError') {
    console.log('Stream was aborted');
  }
}
```

## Error Handling

### Handling Stream Errors

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});

try {
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      process.stdout.write(event.delta.text);
    }
  }

  const finalMessage = await stream.finalMessage();
} catch (error) {
  if (error instanceof Anthropic.APIError) {
    console.error('API Error:', error.status, error.message);
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Retry Logic

```typescript
async function streamWithRetry(
  params: Anthropic.MessageCreateParams,
  maxRetries = 3
): Promise<Anthropic.Message> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const stream = client.messages.stream(params);

      for await (const event of stream) {
        // Process events
      }

      return await stream.finalMessage();
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;

      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw new Error('Max retries exceeded');
}
```

## Best Practices

### 1. Use Event Listeners for UI Updates

```typescript
// React example
function ChatComponent() {
  const [text, setText] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);

  async function sendMessage(userMessage: string) {
    setIsStreaming(true);
    setText('');

    const stream = client.messages.stream({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages: [{ role: 'user', content: userMessage }],
    });

    stream.on('text', (delta) => {
      setText(prev => prev + delta);
    });

    stream.on('end', () => {
      setIsStreaming(false);
    });

    await stream.finalMessage();
  }

  return (
    <div>
      <div>{text}</div>
      {isStreaming && <Spinner />}
    </div>
  );
}
```

### 2. Buffer for Performance

For high-frequency updates, buffer text:

```typescript
let buffer = '';
let lastUpdate = Date.now();
const UPDATE_INTERVAL = 50; // ms

const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a story' }],
});

stream.on('text', (text) => {
  buffer += text;

  const now = Date.now();
  if (now - lastUpdate > UPDATE_INTERVAL) {
    updateUI(buffer);
    buffer = '';
    lastUpdate = now;
  }
});

stream.on('end', () => {
  if (buffer) {
    updateUI(buffer);
  }
});

await stream.finalMessage();
```

### 3. Track Token Usage

```typescript
let inputTokens = 0;
let outputTokens = 0;

const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Hello' }],
});

for await (const event of stream) {
  if (event.type === 'message_start') {
    inputTokens = event.message.usage.input_tokens;
  } else if (event.type === 'message_delta') {
    outputTokens = event.usage.output_tokens;
  }
}

console.log('Total tokens:', inputTokens + outputTokens);
console.log('Cost estimate:', calculateCost(inputTokens, outputTokens));
```

### 4. Handle Tool Use in Streams

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What is the weather?' }],
  tools: [weatherTool],
});

let toolUseBlock: Anthropic.ToolUseBlock | null = null;

for await (const event of stream) {
  if (event.type === 'content_block_start' && event.content_block.type === 'tool_use') {
    toolUseBlock = event.content_block;
  } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    process.stdout.write(event.delta.text);
  }
}

const finalMessage = await stream.finalMessage();

if (finalMessage.stop_reason === 'tool_use' && toolUseBlock) {
  // Execute tool and continue conversation
  const toolResult = await executeToolFunction(toolUseBlock.name, toolUseBlock.input);
  // ... continue with tool result
}
```

### 5. Server-Sent Events (SSE) for Web

```typescript
// Express.js example
app.post('/api/chat', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: req.body.messages,
  });

  stream.on('text', (text) => {
    res.write(`data: ${JSON.stringify({ type: 'text', text })}\n\n`);
  });

  stream.on('end', () => {
    res.write('data: [DONE]\n\n');
    res.end();
  });

  stream.on('error', (error) => {
    res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
    res.end();
  });

  await stream.finalMessage();
});
```

## Common Patterns

### Progress Indicator

```typescript
let wordCount = 0;

const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write an essay' }],
});

stream.on('text', (text) => {
  wordCount += text.split(/\s+/).length;
  console.log(`Words generated: ${wordCount}`);
});

await stream.finalMessage();
```

### Streaming to File

```typescript
import { createWriteStream } from 'fs';

const fileStream = createWriteStream('output.txt');

const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'Write a report' }],
});

stream.on('text', (text) => {
  fileStream.write(text);
});

stream.on('end', () => {
  fileStream.end();
  console.log('File written successfully');
});

await stream.finalMessage();
```

### Multi-User Streaming

```typescript
const activeStreams = new Map<string, Anthropic.MessageStream>();

function startStreamForUser(userId: string, message: string) {
  const stream = client.messages.stream({
    model: 'claude-sonnet-4-5-20250929',
    max_tokens: 1024,
    messages: [{ role: 'user', content: message }],
  });

  activeStreams.set(userId, stream);

  stream.on('text', (text) => {
    sendToUser(userId, text);
  });

  stream.on('end', () => {
    activeStreams.delete(userId);
  });

  return stream.finalMessage();
}

function cancelStreamForUser(userId: string) {
  const stream = activeStreams.get(userId);
  if (stream) {
    stream.abort();
    activeStreams.delete(userId);
  }
}
```
