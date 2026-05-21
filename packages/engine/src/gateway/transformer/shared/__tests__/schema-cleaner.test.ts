import { describe, expect, it } from 'bun:test';

import { cleanSchemaForOpenAI } from '../schema-cleaner';

describe('cleanSchemaForOpenAI', () => {
  it('should remove $schema field', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    const result = cleanSchemaForOpenAI(schema) as Record<string, unknown>;

    expect(result.$schema).toBeUndefined();
    expect(result.type).toBe('object');
    expect(result.properties).toBeDefined();
  });

  it('should preserve additionalProperties field (required by OpenAI)', () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
      additionalProperties: false,
    };

    const result = cleanSchemaForOpenAI(schema) as Record<string, unknown>;

    // OpenAI API 要求保留 additionalProperties
    expect(result.additionalProperties).toBe(false);
    expect(result.type).toBe('object');
  });

  it('should preserve enum and description fields', () => {
    const schema = {
      type: 'string',
      description: 'A color choice',
      enum: ['red', 'green', 'blue'],
    };

    const result = cleanSchemaForOpenAI(schema) as Record<string, unknown>;

    expect(result.type).toBe('string');
    expect(result.description).toBe('A color choice');
    expect(result.enum).toEqual(['red', 'green', 'blue']);
  });

  it('should recursively clean nested properties', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        user: {
          type: 'object',
          $id: 'user-schema',
          properties: {
            name: { type: 'string' },
            age: { type: 'number' },
          },
          additionalProperties: false,
        },
      },
    };

    const result = cleanSchemaForOpenAI(schema) as Record<string, unknown>;
    const userProp = (result.properties as Record<string, unknown>).user as Record<string, unknown>;

    expect(result.$schema).toBeUndefined();
    expect(userProp.$id).toBeUndefined();
    // additionalProperties 应该被保留（OpenAI 要求）
    expect(userProp.additionalProperties).toBe(false);
    expect(userProp.type).toBe('object');
    expect(userProp.properties).toBeDefined();
  });

  it('should clean items in array schemas', () => {
    const schema = {
      type: 'array',
      items: {
        type: 'object',
        $defs: {
          internalType: { type: 'string' },
        },
        properties: {
          id: { type: 'number' },
        },
      },
    };

    const result = cleanSchemaForOpenAI(schema) as Record<string, unknown>;
    const items = result.items as Record<string, unknown>;

    expect(items.$defs).toBeUndefined();
    expect(items.type).toBe('object');
    expect(items.properties).toBeDefined();
  });

  it('should handle null and undefined', () => {
    expect(cleanSchemaForOpenAI(null)).toBeNull();
    expect(cleanSchemaForOpenAI(undefined)).toBeUndefined();
  });

  it('should handle non-object primitives', () => {
    expect(cleanSchemaForOpenAI('string')).toBe('string');
    expect(cleanSchemaForOpenAI(123)).toBe(123);
    expect(cleanSchemaForOpenAI(true)).toBe(true);
  });

  it('should remove all banned fields', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'my-schema',
      $ref: '#/$defs/MyType',
      $defs: {
        MyType: { type: 'string' },
      },
      definitions: {
        OldStyleType: { type: 'number' },
      },
      additionalProperties: false,
      $comment: 'This is a comment',
      type: 'object',
      properties: {
        name: { type: 'string' },
      },
    };

    const result = cleanSchemaForOpenAI(schema) as Record<string, unknown>;

    // 元数据字段应该被移除
    expect(result.$schema).toBeUndefined();
    expect(result.$id).toBeUndefined();
    expect(result.$ref).toBeUndefined();
    expect(result.$defs).toBeUndefined();
    expect(result.definitions).toBeUndefined();
    expect(result.$comment).toBeUndefined();
    
    // additionalProperties 应该被保留（OpenAI 要求）
    expect(result.additionalProperties).toBe(false);

    // 有效字段应该保留
    expect(result.type).toBe('object');
    expect(result.properties).toBeDefined();
  });

  it('should preserve validation fields', () => {
    const schema = {
      type: 'string',
      format: 'email',
      pattern: '^[a-z]+$',
      minLength: 5,
      maxLength: 100,
    };

    const result = cleanSchemaForOpenAI(schema) as Record<string, unknown>;

    expect(result.format).toBe('email');
    expect(result.pattern).toBe('^[a-z]+$');
    expect(result.minLength).toBe(5);
    expect(result.maxLength).toBe(100);
  });

  it('should handle complex nested structures', () => {
    const schema = {
      $schema: 'http://json-schema.org/draft-07/schema#',
      type: 'object',
      properties: {
        users: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string' },
              roles: {
                type: 'array',
                items: {
                  type: 'string',
                  enum: ['admin', 'user', 'guest'],
                },
              },
            },
            required: ['name'],
          },
        },
      },
      required: ['users'],
    };

    const result = cleanSchemaForOpenAI(schema) as Record<string, unknown>;
    const usersItems = ((result.properties as Record<string, unknown>).users as Record<string, unknown>).items as Record<string, unknown>;
    const rolesItems = ((usersItems.properties as Record<string, unknown>).roles as Record<string, unknown>).items as Record<string, unknown>;

    // 元数据字段应该被移除
    expect(result.$schema).toBeUndefined();

    // additionalProperties 应该被保留（OpenAI 要求）
    expect(usersItems.additionalProperties).toBe(false);

    // 有效字段应该保留
    expect(result.type).toBe('object');
    expect(result.required).toEqual(['users']);
    expect(usersItems.required).toEqual(['name']);
    expect(rolesItems.enum).toEqual(['admin', 'user', 'guest']);
  });
});
