export interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string };
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: Record<string, unknown> };
}

export interface GeminiTool {
  functionDeclarations: Array<{ name: string; description: string; parameters?: Record<string, unknown> }>;
}

export interface GeminiGenerationConfig {
  stopSequences?: string[];
  temperature?: number;
  maxOutputTokens?: number;
  topP?: number;
  topK?: number;
}

export interface GeminiRequest {
  contents: GeminiContent[];
  tools?: GeminiTool[];
  generationConfig?: GeminiGenerationConfig;
  systemInstruction?: { parts: Array<{ text: string }> };
}

export interface GeminiCandidate {
  content: GeminiContent;
  finishReason: 'STOP' | 'MAX_TOKENS' | 'SAFETY' | 'RECITATION' | 'OTHER' | 'BLOCKLIST' | 'PROHIBITED_CONTENT' | 'SPII' | 'MALFORMED_FUNCTION_CALL';
  safetyRatings?: Array<{ category: string; probability: string }>;
  usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
}

export interface GeminiResponse {
  candidates: GeminiCandidate[];
  usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number; totalTokenCount: number };
}

export interface GeminiStreamEvent {
  candidates?: GeminiCandidate[];
  usageMetadata?: Record<string, unknown>;
}
