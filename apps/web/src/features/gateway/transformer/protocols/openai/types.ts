/**
 * OpenAI 协议类型定义
 * OpenAI API 请求/响应/流式数据的 TypeScript 类型
 */

import type { ToolDefinition } from '@/types';

// ==================== 请求类型 ====================

export interface OpenAIMessage {
  role: 'user' | 'assistant' | 'system' | 'tool';
  content?: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
  name?: string;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  reasoning_content?: string; // 阿里云百炼特有
}

export interface OpenAIRequest {
  model: string;
  messages: OpenAIMessage[];
  temperature?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stream?: boolean;
  stream_options?: {
    include_usage?: boolean;
  };
  tools?: ToolDefinition[];
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function'; function: { name: string } };
  response_format?: {
    type: 'text' | 'json_object' | 'json_schema';
    schema?: unknown;
  };
  stop?: string | string[];
  seed?: number;
  reasoning_effort?: 'low' | 'medium' | 'high';
}

// ==================== 流式类型 ====================

export interface OpenAIStreamChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: Array<{
    index: number;
    delta: {
      role?: string;
      content?: string;
      reasoning_content?: string; // 阿里云百炼特有
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
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// ==================== 响应类型 ====================

export interface OpenAIChoice {
  index: number;
  message?: {
    role: string;
    content?: string;
    reasoning_content?: string; // 阿里云百炼特有
    tool_calls?: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }>;
  };
  finish_reason: string | null;
}
