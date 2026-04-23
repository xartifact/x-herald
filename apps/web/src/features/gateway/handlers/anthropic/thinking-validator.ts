/**
 * 规范化 Anthropic 透传消息
 * 某些 Anthropic 兼容 Provider（如 MiniMax）不支持在 user 消息中混合 tool_result 和 text 块。
 * 此函数将这类混合消息拆分为独立消息，确保 Provider 兼容性。
 *
 * 例：[{tool_result}, {text}] → 两条 user 消息：[{tool_result}] + [{text}]
 */
export function normalizeAnthropicPassthroughMessages(
  messages: Array<{ role: string; content: unknown }>,
): Array<{ role: string; content: unknown }> {
  const result: Array<{ role: string; content: unknown }> = [];

  for (const msg of messages) {
    if (msg.role !== 'user' || !Array.isArray(msg.content)) {
      result.push(msg);
      continue;
    }

    const blocks = msg.content as Array<{ type: string; [key: string]: unknown }>;
    const hasToolResult = blocks.some((b) => b.type === 'tool_result');
    const hasNonToolResult = blocks.some((b) => b.type !== 'tool_result');

    if (!hasToolResult || !hasNonToolResult) {
      result.push(msg);
      continue;
    }

    const toolResultBlocks = blocks.filter((b) => b.type === 'tool_result');
    const otherBlocks = blocks.filter((b) => b.type !== 'tool_result');

    result.push({ ...msg, content: toolResultBlocks });

    if (otherBlocks.length > 0) {
      result.push({ ...msg, content: otherBlocks });
    }
  }

  return result;
}

/**
 * 检查是否存在缺少 thinking 块的 assistant 消息
 */
export function hasAssistantMessagesWithoutThinking(
  messages: Array<{ role: string; content: unknown }>,
): boolean {
  return messages.some((msg) => {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      return false;
    }
    const blocks = msg.content as Array<{ type: string; [key: string]: unknown }>;
    return blocks.length > 0 && !blocks.some((b) => b.type === 'thinking');
  });
}

/**
 * 注入合成 thinking 块（inject 策略）
 * 适用于无 signature 校验的 Provider，为缺少 thinking 块的 assistant 消息注入占位 thinking。
 */
export function injectSyntheticThinkingBlocks(
  messages: Array<{ role: string; content: unknown }>,
): Array<{ role: string; content: unknown }> {
  return messages.map((msg) => {
    if (msg.role !== 'assistant' || !Array.isArray(msg.content)) {
      return msg;
    }
    const blocks = msg.content as Array<{ type: string; [key: string]: unknown }>;
    if (blocks.some((b) => b.type === 'thinking')) {
      return msg;
    }
    return {
      ...msg,
      content: [{ type: 'thinking', thinking: '...' }, ...blocks],
    };
  });
}
