import { describe, it, expect } from 'bun:test'

/**
 * 清理文本内容中的控制标签
 * (复制自 anthropic.ts 用于测试)
 */
function sanitizeStreamContent(text: string): string {
  if (!text) return text

  const controlTagPatterns = [
    /<is_displaying_contents>[\s\S]*?<\/is_displaying_contents>/gi,
    /<filepaths>[\s\S]*?<\/filepaths>/gi,
  ]

  let cleaned = text
  for (const pattern of controlTagPatterns) {
    cleaned = cleaned.replace(pattern, '')
  }

  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()

  return cleaned
}

describe('Anthropic 内容清理', () => {
  it('应该移除 is_displaying_contents 标签', () => {
    const input = '<is_displaying_contents>\nfalse\n</is_displaying_contents>\n\n正常内容'
    const result = sanitizeStreamContent(input)
    expect(result).toBe('正常内容')
    expect(result).not.toContain('<is_displaying_contents>')
  })

  it('应该移除 filepaths 标签', () => {
    const input = '前置内容\n<filepaths>\n</filepaths>\n后置内容'
    const result = sanitizeStreamContent(input)
    expect(result).not.toContain('<filepaths>')
    expect(result).toContain('前置内容')
    expect(result).toContain('后置内容')
  })

  it('应该同时移除多个控制标签', () => {
    const input =
      '<is_displaying_contents>\nfalse\n</is_displaying_contents>\n\n<filepaths>\n</filepaths>'
    const result = sanitizeStreamContent(input)
    expect(result).toBe('')
  })

  it('应该保留正常文本内容', () => {
    const input = '这是正常的文本内容，不应该被删除'
    const result = sanitizeStreamContent(input)
    expect(result).toBe(input)
  })

  it('应该处理混合内容', () => {
    const input =
      '开始\n<is_displaying_contents>\ntrue\n</is_displaying_contents>\n中间\n<filepaths>\ntest.ts\n</filepaths>\n结束'
    const result = sanitizeStreamContent(input)
    expect(result).not.toContain('<is_displaying_contents>')
    expect(result).not.toContain('<filepaths>')
    expect(result).toContain('开始')
    expect(result).toContain('中间')
    expect(result).toContain('结束')
  })

  it('应该处理真实场景中的控制标签', () => {
    const input =
      '<is_displaying_contents>\nfalse\n</is_displaying_contents>\n\n<filepaths>\n</filepaths>\n\n我将帮你分析这个问题'
    const result = sanitizeStreamContent(input)
    expect(result).toBe('我将帮你分析这个问题')
  })

  it('应该清理多余的空白行', () => {
    const input = '第一行\n\n\n\n第二行'
    const result = sanitizeStreamContent(input)
    expect(result).toBe('第一行\n\n第二行')
  })

  it('应该处理空字符串', () => {
    const result = sanitizeStreamContent('')
    expect(result).toBe('')
  })

  it('应该处理只包含控制标签的字符串', () => {
    const input = '<is_displaying_contents>\nfalse\n</is_displaying_contents>'
    const result = sanitizeStreamContent(input)
    expect(result).toBe('')
  })
})
