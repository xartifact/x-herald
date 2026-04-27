/**
 * Anthropic 协议类型定义
 * Anthropic API 请求/响应/流式数据的 TypeScript 类型
 */

// ==================== 请求类型 ====================

export interface AnthropicMessage {
  role: 'user' | 'assistant' | 'tool';
  content:
    | string
    | Array<
        | { type: 'text'; text: string; cache_control?: Record<string, unknown> }
        | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } | { type: 'url'; url: string }; cache_control?: Record<string, unknown> }
        | { type: 'thinking'; thinking: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown>; cache_control?: Record<string, unknown> }
        | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean; cache_control?: Record<string, unknown> }
      >;
}

export interface AnthropicTool {
  name: string;
  description?: string;
  input_schema: {
    type: 'object';
    properties?: Record<string, unknown>;
    required?: string[];
    [key: string]: unknown;
  };
  cache_control?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface AnthropicRequest {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature?: number;
  top_p?: number;
  top_k?: number;
  stream?: boolean;
  system?:
    | string
    | Array<{
        type: 'text';
        text: string;
        cache_control?: Record<string, unknown>;
      }>;
  tools?: AnthropicTool[];
  tool_choice?: { type: 'auto' } | { type: 'any' } | { type: 'tool'; name: string };
  stop_sequences?: string[];
  metadata?: {
    user_id?: string;
  };
  thinking?: {
    type: 'enabled' | 'adaptive';
    budget_tokens?: number;
  };
  output_config?: {
    type: 'text' | 'json_object' | 'json_schema';
    schema?: unknown;
  };
}

// ==================== 响应类型 ====================

export interface AnthropicContentBlock {
  type: 'text' | 'tool_use' | 'thinking';
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  thinking?: string;
  signature?: string;
}

export interface AnthropicResponse {
  id: string;
  type: 'message';
  role: 'assistant';
  model: string;
  content: AnthropicContentBlock[];
  stop_reason: 'end_turn' | 'max_tokens' | 'stop_sequence' | 'tool_use' | null;
  stop_sequence: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

// ==================== 流式类型 ====================

export interface AnthropicStreamEvent {
  type: 'message_start' | 'content_block_start' | 'content_block_delta' | 'content_block_stop' | 'message_delta' | 'message_stop';
  message?: AnthropicResponse;
  index?: number;
  content_block?: AnthropicContentBlock;
  delta?: {
    type?: string;
    text?: string;
    thinking?: string;
    signature?: string;
    partial_json?: string;
    stop_reason?: string;
  };
  usage?: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number;
  };
}
