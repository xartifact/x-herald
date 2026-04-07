/**
 * 工具参数解析器单元测试
 */

import { describe, it, expect } from 'bun:test';

import { parseToolArguments } from '../tool-arguments-parser';

describe('parseToolArguments', () => {
  describe('标准 JSON 解析', () => {
    it('应该解析标准 JSON 对象', () => {
      const input = '{"key": "value"}';
      const result = parseToolArguments(input);
      expect(result).toBe(input);
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });

    it('应该解析嵌套的 JSON 对象', () => {
      const input = '{"user": {"name": "Alice", "age": 30}}';
      const result = parseToolArguments(input);
      expect(JSON.parse(result)).toEqual({
        user: { name: 'Alice', age: 30 },
      });
    });

    it('应该解析包含数组的 JSON', () => {
      const input = '{"items": [1, 2, 3], "tags": ["a", "b"]}';
      const result = parseToolArguments(input);
      expect(JSON.parse(result)).toEqual({
        items: [1, 2, 3],
        tags: ['a', 'b'],
      });
    });
  });

  describe('JSON5 宽松语法', () => {
    it('应该修复尾随逗号', () => {
      const input = '{"key": "value",}';
      const result = parseToolArguments(input);
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });

    it('应该处理单引号', () => {
      const input = "{'key': 'value'}";
      const result = parseToolArguments(input);
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });

    it('应该处理混合引号', () => {
      const input = '{"key": \'value\', \'another\': "test"}';
      const result = parseToolArguments(input);
      const parsed = JSON.parse(result);
      expect(parsed.key).toBe('value');
      expect(parsed.another).toBe('test');
    });
  });

  describe('jsonrepair 智能修复', () => {
    it('应该修复缺少引号的键', () => {
      const input = '{key: "value"}';
      const result = parseToolArguments(input);
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });

    it('应该修复缺少引号的值', () => {
      const input = '{"key": value}';
      const result = parseToolArguments(input);
      // jsonrepair 会尝试修复，结果可能是 {"key": "value"} 或其他有效形式
      expect(() => JSON.parse(result)).not.toThrow();
    });

    it('应该修复多余的逗号', () => {
      const input = '{"a": 1,, "b": 2}';
      const result = parseToolArguments(input);
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('边界情况', () => {
    it('应该处理空字符串', () => {
      const result = parseToolArguments('');
      expect(result).toBe('{}');
    });

    it('应该处理空白字符串', () => {
      const result = parseToolArguments('   ');
      expect(result).toBe('{}');
    });

    it('应该处理空对象', () => {
      const input = '{}';
      const result = parseToolArguments(input);
      expect(result).toBe('{}');
    });

    it('应该处理包含空格的 JSON', () => {
      const input = '  { "key" : "value" }  ';
      const result = parseToolArguments(input);
      expect(JSON.parse(result)).toEqual({ key: 'value' });
    });
  });

  describe('降级处理', () => {
    it('应该对完全无效的输入返回空对象', () => {
      const input = 'completely invalid json!!!';
      const result = parseToolArguments(input);
      expect(result).toBe('{}');
    });

    it('应该对随机文本返回空对象', () => {
      const input = 'hello world';
      const result = parseToolArguments(input);
      expect(result).toBe('{}');
    });

    it('应该对不完整的 JSON 返回空对象', () => {
      const input = '{"key": "val';
      const result = parseToolArguments(input);
      // jsonrepair 可能会修复，如果修复失败则返回 {}
      expect(() => JSON.parse(result)).not.toThrow();
    });
  });

  describe('实际场景', () => {
    it('应该处理 LLM 生成的带注释的 JSON', () => {
      const input = `{
        // 用户信息
        "name": "Alice",
        "age": 30
      }`;
      const result = parseToolArguments(input);
      expect(JSON.parse(result)).toEqual({ name: 'Alice', age: 30 });
    });

    it('应该处理复杂的工具参数', () => {
      const input = `{
        "query": "search term",
        "filters": {
          "category": "books",
          "price_range": [10, 50]
        },
        "limit": 10,
      }`;
      const result = parseToolArguments(input);
      const parsed = JSON.parse(result);
      expect(parsed.query).toBe('search term');
      expect(parsed.filters.category).toBe('books');
      expect(parsed.limit).toBe(10);
    });
  });
});
