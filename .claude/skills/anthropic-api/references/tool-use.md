# Tool Use (Function Calling) Reference

This guide covers advanced patterns for implementing tool use with the Anthropic API.

## Table of Contents

1. [Basic Tool Definition](#basic-tool-definition)
2. [Tool Execution Loop](#tool-execution-loop)
3. [Helper Libraries](#helper-libraries)
4. [Streaming with Tools](#streaming-with-tools)
5. [Best Practices](#best-practices)

## Basic Tool Definition

Tools are defined using JSON Schema:

```typescript
const tools: Anthropic.Tool[] = [
  {
    name: 'get_weather',
    description: 'Get the current weather in a given location',
    input_schema: {
      type: 'object',
      properties: {
        location: {
          type: 'string',
          description: 'The city and state, e.g. San Francisco, CA'
        },
        unit: {
          type: 'string',
          enum: ['celsius', 'fahrenheit'],
          description: 'Temperature unit'
        }
      },
      required: ['location']
    }
  }
];
```

**Key points:**
- `name`: Unique identifier for the tool
- `description`: Helps Claude understand when to use the tool
- `input_schema`: JSON Schema defining expected parameters
- Use `description` fields in properties to guide Claude's input generation

## Tool Execution Loop

### Manual Tool Handling

```typescript
async function chatWithTools(userMessage: string) {
  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userMessage }
  ];

  while (true) {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 1024,
      messages,
      tools,
    });

    // Add assistant's response to conversation
    messages.push({ role: 'assistant', content: response.content });

    // Check if Claude wants to use a tool
    if (response.stop_reason === 'tool_use') {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      // Process all tool use blocks
      for (const block of response.content) {
        if (block.type === 'tool_use') {
          // Execute the tool
          const result = await executeToolFunction(block.name, block.input);

          toolResults.push({
            type: 'tool_result',
            tool_use_id: block.id,
            content: result,
          });
        }
      }

      // Send tool results back to Claude
      messages.push({ role: 'user', content: toolResults });
    } else {
      // No more tool calls, return final response
      return response;
    }
  }
}

async function executeToolFunction(name: string, input: any): Promise<string> {
  switch (name) {
    case 'get_weather':
      return getWeather(input.location, input.unit);
    case 'search_database':
      return searchDatabase(input.query);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
```

### Tool Choice Control

Control when Claude can use tools:

```typescript
// Let Claude decide (default)
tool_choice: { type: 'auto' }

// Force Claude to use a specific tool
tool_choice: { type: 'tool', name: 'get_weather' }

// Require Claude to use any tool
tool_choice: { type: 'any' }
```

## Helper Libraries

### Using Zod for Type Safety

```typescript
import { betaZodTool } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

const weatherTool = betaZodTool({
  name: 'get_weather',
  inputSchema: z.object({
    location: z.string().describe('The city and state, e.g. San Francisco, CA'),
    unit: z.enum(['celsius', 'fahrenheit']).default('fahrenheit'),
  }),
  description: 'Get the current weather in a given location',
  run: async (input) => {
    // input is fully typed!
    const weather = await fetchWeather(input.location, input.unit);
    return `The weather in ${input.location} is ${weather.temp}°${input.unit === 'celsius' ? 'C' : 'F'}`;
  },
});

// Use with tool runner
const runner = client.beta.tools.run({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What is the weather in SF?' }],
  tools: [weatherTool],
});

const finalMessage = await runner.finalMessage();
```

### Using JSON Schema

```typescript
import { betaTool } from '@anthropic-ai/sdk/helpers/json-schema';

const calculatorTool = betaTool({
  name: 'calculator',
  input_schema: {
    type: 'object',
    properties: {
      operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
      a: { type: 'number' },
      b: { type: 'number' },
    },
    required: ['operation', 'a', 'b'],
  },
  description: 'Perform basic arithmetic operations',
  run: (input) => {
    const { operation, a, b } = input;
    switch (operation) {
      case 'add': return String(a + b);
      case 'subtract': return String(a - b);
      case 'multiply': return String(a * b);
      case 'divide': return String(a / b);
      default: throw new Error(`Unknown operation: ${operation}`);
    }
  },
});
```

## Streaming with Tools

Stream responses while handling tool calls:

```typescript
const stream = client.messages.stream({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What is the weather in SF?' }],
  tools,
});

stream
  .on('text', (text) => {
    console.log('Text:', text);
  })
  .on('tool_use', (toolUse) => {
    console.log('Tool call:', toolUse.name, toolUse.input);
  })
  .on('message', (message) => {
    console.log('Message complete:', message);
  });

const finalMessage = await stream.finalMessage();

// Handle tool calls if needed
if (finalMessage.stop_reason === 'tool_use') {
  // Process tool calls as shown in manual handling
}
```

### BetaToolRunner for Automatic Tool Execution

```typescript
import { BetaToolRunner } from '@anthropic-ai/sdk/helpers/tools';

const runner = client.beta.tools.run({
  model: 'claude-sonnet-4-5-20250929',
  max_tokens: 1024,
  messages: [{ role: 'user', content: 'What is the weather in SF and NYC?' }],
  tools: [weatherTool, calculatorTool],
});

// Automatically handles tool execution loop
for await (const messageStream of runner) {
  for await (const event of messageStream) {
    if (event.type === 'text') {
      process.stdout.write(event.text);
    }
  }
}

const finalMessage = await runner.finalMessage();
```

## Best Practices

### 1. Clear Tool Descriptions

```typescript
// Good
{
  name: 'search_products',
  description: 'Search the product catalog by name, category, or SKU. Returns up to 10 matching products with prices and availability.',
  // ...
}

// Bad
{
  name: 'search_products',
  description: 'Search products',
  // ...
}
```

### 2. Validate Tool Inputs

```typescript
async function executeToolFunction(name: string, input: any): Promise<string> {
  try {
    // Validate input
    if (name === 'get_weather' && !input.location) {
      return 'Error: location is required';
    }

    // Execute tool
    const result = await actualToolFunction(input);
    return JSON.stringify(result);
  } catch (error) {
    // Return error as string, not throw
    return `Error executing ${name}: ${error.message}`;
  }
}
```

### 3. Handle Multiple Tool Calls

Claude can request multiple tools in one response:

```typescript
const toolResults: Anthropic.ToolResultBlockParam[] = [];

for (const block of response.content) {
  if (block.type === 'tool_use') {
    const result = await executeToolFunction(block.name, block.input);
    toolResults.push({
      type: 'tool_result',
      tool_use_id: block.id,
      content: result,
    });
  }
}

// Send all results back together
messages.push({ role: 'user', content: toolResults });
```

### 4. Return Structured Data

```typescript
run: async (input) => {
  const data = await fetchData(input);

  // Return as JSON string for complex data
  return JSON.stringify({
    success: true,
    data: data,
    timestamp: new Date().toISOString(),
  });
}
```

### 5. Set Appropriate max_tokens

Tool use requires tokens for both tool calls and responses:

```typescript
// Too low - may cut off tool responses
max_tokens: 100

// Better - allows for tool calls and responses
max_tokens: 1024

// For complex multi-tool scenarios
max_tokens: 4096
```

### 6. Handle Tool Errors Gracefully

```typescript
run: async (input) => {
  try {
    const result = await riskyOperation(input);
    return JSON.stringify({ success: true, result });
  } catch (error) {
    // Return error info, don't throw
    return JSON.stringify({
      success: false,
      error: error.message,
      suggestion: 'Try with different parameters'
    });
  }
}
```

## Common Patterns

### Database Query Tool

```typescript
const queryTool = betaZodTool({
  name: 'query_database',
  inputSchema: z.object({
    query: z.string().describe('SQL query to execute'),
    limit: z.number().optional().default(10),
  }),
  description: 'Execute a read-only SQL query against the database',
  run: async (input) => {
    const results = await db.query(input.query, { limit: input.limit });
    return JSON.stringify(results);
  },
});
```

### API Call Tool

```typescript
const apiTool = betaZodTool({
  name: 'call_api',
  inputSchema: z.object({
    endpoint: z.string(),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE']),
    body: z.record(z.any()).optional(),
  }),
  description: 'Make an HTTP request to an external API',
  run: async (input) => {
    const response = await fetch(input.endpoint, {
      method: input.method,
      body: input.body ? JSON.stringify(input.body) : undefined,
      headers: { 'Content-Type': 'application/json' },
    });
    return await response.text();
  },
});
```

### File System Tool

```typescript
const readFileTool = betaZodTool({
  name: 'read_file',
  inputSchema: z.object({
    path: z.string().describe('File path to read'),
  }),
  description: 'Read contents of a file from the file system',
  run: async (input) => {
    const content = await fs.readFile(input.path, 'utf-8');
    return content;
  },
});
```
