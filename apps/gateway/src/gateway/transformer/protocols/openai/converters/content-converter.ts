import type { MessageContent } from '@xartifact/x-llm-gateway-shared';

/**
 * Convert OpenAI content to Standard format
 */
export function convertContent(
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> | undefined,
): string | MessageContent[] {
  if (!content) return '';
  if (typeof content === 'string') return content;

  return content.map((item) => {
    if (item.type === 'text') {
      return { type: 'text', text: item.text };
    } else {
      return {
        type: 'image_url',
        image_url: {
          url: item.image_url.url,
        },
      };
    }
  });
}

/**
 * Convert Standard content to OpenAI format
 */
export function convertToOpenAIContent(
  msgContent: string | MessageContent[] | undefined,
): string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> | undefined {
  if (msgContent === undefined) return undefined;
  if (typeof msgContent === 'string') return msgContent;

  return msgContent.map((item) => {
    if (item.type === 'text') {
      return { type: 'text', text: item.text };
    } else {
      return {
        type: 'image_url',
        image_url: { url: item.image_url.url },
      };
    }
  });
}
