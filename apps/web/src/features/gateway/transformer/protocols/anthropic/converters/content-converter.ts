import type { MessageContent, StandardMessage } from '@/types';

import type { AnthropicMessage } from '../types';

/**
 * Convert Anthropic content to Standard format
 */
export function convertAnthropicContent(
  content: AnthropicMessage['content'],
): string | MessageContent[] {
  if (typeof content === 'string') return content;

  return content
    .filter((item) => item.type === 'text' || item.type === 'image')
    .map((item) => {
      if (item.type === 'text') {
        return {
          type: 'text' as const,
          text: item.text,
          ...('cache_control' in item && item.cache_control && { cache_control: item.cache_control as Record<string, unknown> }),
        };
      } else {
        const cacheCtrl = 'cache_control' in item && item.cache_control ? { cache_control: item.cache_control as Record<string, unknown> } : {};
        if ('source' in item) {
          if (item.source.type === 'base64') {
            return {
              type: 'image_url' as const,
              image_url: {
                url: `data:${item.source.media_type};base64,${item.source.data}`,
              },
              ...cacheCtrl,
            };
          } else {
            return {
              type: 'image_url' as const,
              image_url: { url: item.source.url },
              ...cacheCtrl,
            };
          }
        }
        return { type: 'text' as const, text: '' };
      }
    });
}

/**
 * Convert Standard content to Anthropic format
 */
export function convertToAnthropicContent(msg: StandardMessage): AnthropicMessage['content'] {
  if (typeof msg.content === 'string') return msg.content;

  return msg.content.map((item) => {
    if (item.type === 'text') {
      return {
        type: 'text' as const,
        text: item.text,
        ...(item.cache_control && { cache_control: item.cache_control }),
      };
    } else {
      const url = item.image_url.url;
      const cacheCtrl = item.cache_control ? { cache_control: item.cache_control } : {};
      if (url.startsWith('data:')) {
        const match = url.match(/^data:([^;]+);base64,(.+)$/);
        if (match) {
          return {
            type: 'image',
            source: {
              type: 'base64',
              media_type: match[1],
              data: match[2],
            },
            ...cacheCtrl,
          };
        }
      }
      return {
        type: 'image',
        source: { type: 'url', url },
        ...cacheCtrl,
      };
    }
  });
}
