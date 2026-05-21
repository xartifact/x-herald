/**
 * 清理文本内容中的控制标签
 * 移除 Claude Code CLI 相关的 XML/HTML 控制标签
 */

const CONTROL_TAG_PATTERNS = [
  /<is_displaying_contents>[\s\S]*?<\/is_displaying_contents>/gi,
  /<filepaths>[\s\S]*?<\/filepaths>/gi,
];

/**
 * Sanitize text content by removing control tags
 * Removes Claude Code CLI related XML/HTML control tags
 */
export function sanitizeContent(text: string): string {
  if (!text) return text;

  let cleaned = text;
  for (const pattern of CONTROL_TAG_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}
