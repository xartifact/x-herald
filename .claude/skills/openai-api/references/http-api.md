# OpenAI HTTP API Reference

Complete reference for the OpenAI Chat Completions HTTP API.

## Table of Contents

1. [Endpoints](#endpoints)
2. [Authentication](#authentication)
3. [Request Format](#request-format)
4. [Response Format](#response-format)
5. [Error Handling](#error-handling)

## Endpoints

### Chat Completions

```
POST https://api.openai.com/v1/chat/completions
```

Creates a chat completion for the provided messages.

## Authentication

All requests require an API key in the Authorization header:

```http
Authorization: Bearer {your_api_key}
```

## Request Format

### Headers

```http
Content-Type: application/json
Authorization: Bearer {api_key}
```

### Request Body

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `model` | string | Yes | Model ID (e.g., 'gpt-4o') |
| `messages` | array | Yes | Array of message objects |
| `max_tokens` | integer | No | Max tokens to generate |
| `temperature` | number | No | Sampling temp (0-2, default 1) |
| `top_p` | number | No | Nucleus sampling (0-1) |
| `n` | integer | No | Number of completions (default 1) |
| `stream` | boolean | No | Enable streaming (default false) |
| `stop` | string/array | No | Stop sequences |
| `presence_penalty` | number | No | -2.0 to 2.0 |
| `frequency_penalty` | number | No | -2.0 to 2.0 |
| `logit_bias` | object | No | Token bias map |
| `user` | string | No | End-user ID |
| `seed` | integer | No | Deterministic sampling |
| `tools` | array | No | Available tools |
| `tool_choice` | string/object | No | Tool selection control |
| `response_format` | object | No | Output format control |

### Message Object

```typescript
interface ChatCompletionMessageParam {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | Array<ContentPart>;
  name?: string;
  tool_calls?: Array<ToolCall>;
  tool_call_id?: string;
}

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string; detail?: 'low' | 'high' | 'auto' } };
```

### Tool Definition

```typescript
interface ChatCompletionTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: object; // JSON Schema
  };
}
```

### Tool Choice

```typescript
type ChatCompletionToolChoiceOption =
  | 'none'
  | 'auto'
  | 'required'
  | { type: 'function'; function: { name: string } };
```

### Response Format

```typescript
interface ResponseFormat {
  type: 'text' | 'json_object' | 'json_schema';
  json_schema?: {
    name: string;
    description?: string;
    schema: object;
    strict?: boolean;
  };
}
```

## Response Format

### Success Response (200 OK)

```typescript
interface ChatCompletion {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
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
    logprobs?: object;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_tokens_details?: {
      cached_tokens?: number;
      audio_tokens?: number;
    };
    completion_tokens_details?: {
      reasoning_tokens?: number;
      audio_tokens?: number;
      accepted_prediction_tokens?: number;
      rejected_prediction_tokens?: number;
    };
  };
  system_fingerprint?: string;
}
```

### Example Response

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1677858242,
  "model": "gpt-4o",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 9,
    "completion_tokens": 9,
    "total_tokens": 18
  }
}
```

## Error Handling

### Error Response Format

```typescript
interface ErrorResponse {
  error: {
    message: string;
    type: string;
    param?: string;
    code?: string;
  };
}
```

### HTTP Status Codes

| Status | Description | Retryable |
|--------|-------------|-----------|
| 200 | Success | - |
| 400 | Bad Request | No |
| 401 | Unauthorized | No |
| 403 | Forbidden | No |
| 404 | Not Found | No |
| 429 | Rate Limited | Yes |
| 500 | Server Error | Yes |
| 502 | Bad Gateway | Yes |
| 503 | Service Unavailable | Yes |

### Common Error Types

```typescript
type ErrorType =
  | 'invalid_request_error'    // Invalid request parameters
  | 'authentication_error'     // API key issues
  | 'rate_limit_error'        // Too many requests
  | 'server_error'            // OpenAI server issues
  | 'insufficient_quota'      // Billing/quota exceeded
  | 'context_length_exceeded' // Token limit exceeded
  | 'content_filter'          // Content policy violation
  ;
```

### Error Examples

**Invalid Model:**
```json
{
  "error": {
    "message": "The model 'gpt-99' does not exist",
    "type": "invalid_request_error",
    "param": "model",
    "code": "model_not_found"
  }
}
```

**Rate Limit:**
```json
{
  "error": {
    "message": "Rate limit reached for requests",
    "type": "rate_limit_error",
    "param": null,
    "code": "rate_limit_exceeded"
  }
}
```

**Context Length:**
```json
{
  "error": {
    "message": "This model's maximum context length is 8192 tokens",
    "type": "invalid_request_error",
    "param": "messages",
    "code": "context_length_exceeded"
  }
}
```

## Request Examples

### Simple Chat

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

### With System Message

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You are a helpful assistant."},
      {"role": "user", "content": "What is 2+2?"}
    ],
    "temperature": 0.7
  }'
```

### With Vision (Images)

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "text", "text": "What is in this image?"},
          {
            "type": "image_url",
            "image_url": {
              "url": "https://example.com/image.jpg"
            }
          }
        ]
      }
    ]
  }'
```

### JSON Mode

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "system", "content": "You output JSON."},
      {"role": "user", "content": "List 3 planets"}
    ],
    "response_format": {"type": "json_object"}
  }'
```

### With Tools

```bash
curl https://api.openai.com/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $OPENAI_API_KEY" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "What is the weather in Tokyo?"}
    ],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "get_weather",
          "description": "Get weather for a location",
          "parameters": {
            "type": "object",
            "properties": {
              "location": {"type": "string"}
            },
            "required": ["location"]
          }
        }
      }
    ],
    "tool_choice": "auto"
  }'
```
