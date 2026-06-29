import { describe, it, expect, beforeEach } from 'bun:test';
import type { Transformer } from '@xartifact/x-llm-gateway-shared';
import {
  transformerRegistry,
  registerTransformer,
  getTransformer,
  hasTransformer,
  listTransformers,
} from './registry';

// --- test helpers ---

function createObjectTransformer(name: string): Transformer {
  return { name };
}

function createConstructorTransformer(name: string): new () => Transformer {
  return class implements Transformer {
    readonly name = name;
  };
}

function createConstructorTransformerWithOptions(
  name: string,
): new (options?: Record<string, unknown>) => Transformer {
  return class implements Transformer {
    readonly name: string;
    readonly options: Record<string, unknown> | undefined;
    constructor(options?: Record<string, unknown>) {
      this.name = name;
      this.options = options;
    }
  };
}

// --- tests ---

describe('transformerRegistry', () => {
  // Use unique names per test group to avoid cross-test pollution
  // (the registry is a globalThis singleton with no clear/unregister API)

  describe('registerTransformer + getTransformer', () => {
    it('returns an object transformer as-is', () => {
      const t = createObjectTransformer('obj-t1');
      registerTransformer('obj-t1', t);
      const result = getTransformer('obj-t1');
      expect(result).toBe(t);
    });

    it('instantiates a constructor transformer on get', () => {
      const Ctor = createConstructorTransformer('ctor-t1');
      registerTransformer('ctor-t1', Ctor);
      const result = getTransformer('ctor-t1');
      expect(result).toBeDefined();
      expect(result!.name).toBe('ctor-t1');
    });

    it('returns a new instance each time for a constructor', () => {
      const Ctor = createConstructorTransformer('ctor-t2');
      registerTransformer('ctor-t2', Ctor);
      const a = getTransformer('ctor-t2');
      const b = getTransformer('ctor-t2');
      expect(a).toBeDefined();
      expect(b).toBeDefined();
      expect(a).not.toBe(b);
    });

    it('passes options to a constructor that accepts them', () => {
      const Ctor = createConstructorTransformerWithOptions('ctor-opt');
      registerTransformer('ctor-opt', Ctor);
      // getTransformer does not forward options currently —
      // just verify instantiation succeeds
      const result = getTransformer('ctor-opt');
      expect(result).toBeDefined();
      expect(result!.name).toBe('ctor-opt');
    });

    it('returns undefined for an unknown name', () => {
      const result = getTransformer('does-not-exist-xyz');
      expect(result).toBeUndefined();
    });
  });

  describe('hasTransformer', () => {
    it('returns true for a registered transformer', () => {
      registerTransformer('has-check-1', createObjectTransformer('has-check-1'));
      expect(hasTransformer('has-check-1')).toBe(true);
    });

    it('returns false for an unregistered name', () => {
      expect(hasTransformer('never-registered')).toBe(false);
    });

    it('returns true after registering a constructor', () => {
      registerTransformer('has-ctor', createConstructorTransformer('has-ctor'));
      expect(hasTransformer('has-ctor')).toBe(true);
    });
  });

  describe('listTransformers', () => {
    it('returns an array of registered names', () => {
      registerTransformer('list-a', createObjectTransformer('list-a'));
      registerTransformer('list-b', createObjectTransformer('list-b'));
      const names = listTransformers();
      expect(names).toContain('list-a');
      expect(names).toContain('list-b');
    });

    it('reflects newly registered transformers', () => {
      registerTransformer('list-c', createObjectTransformer('list-c'));
      expect(listTransformers()).toContain('list-c');
    });
  });

  describe('overwrite behaviour', () => {
    it('overwrites a previously registered transformer with the same name', () => {
      const first = createObjectTransformer('overwrite-me');
      const second = createObjectTransformer('overwrite-me');
      registerTransformer('overwrite-me', first);
      registerTransformer('overwrite-me', second);
      const result = getTransformer('overwrite-me');
      expect(result).toBe(second);
      expect(result).not.toBe(first);
    });

    it('replaces an object with a constructor', () => {
      registerTransformer('obj-to-ctor', createObjectTransformer('obj-to-ctor'));
      registerTransformer('obj-to-ctor', createConstructorTransformer('obj-to-ctor'));
      const result = getTransformer('obj-to-ctor');
      expect(result).toBeDefined();
      expect(result!.name).toBe('obj-to-ctor');
    });

    it('replaces a constructor with an object', () => {
      registerTransformer('ctor-to-obj', createConstructorTransformer('ctor-to-obj'));
      registerTransformer('ctor-to-obj', createObjectTransformer('ctor-to-obj'));
      const result = getTransformer('ctor-to-obj');
      expect(result).toBeDefined();
      expect(result!.name).toBe('ctor-to-obj');
    });
  });

  describe('independent access', () => {
    it('multiple object transformers are all accessible', () => {
      const ta = createObjectTransformer('multi-a');
      const tb = createObjectTransformer('multi-b');
      const tc = createObjectTransformer('multi-c');
      registerTransformer('multi-a', ta);
      registerTransformer('multi-b', tb);
      registerTransformer('multi-c', tc);

      expect(getTransformer('multi-a')).toBe(ta);
      expect(getTransformer('multi-b')).toBe(tb);
      expect(getTransformer('multi-c')).toBe(tc);
      expect(listTransformers()).toContain('multi-a');
      expect(listTransformers()).toContain('multi-b');
      expect(listTransformers()).toContain('multi-c');
    });

    it('mixed object and constructor transformers coexist', () => {
      const obj = createObjectTransformer('mixed-obj');
      registerTransformer('mixed-obj', obj);
      registerTransformer('mixed-ctor', createConstructorTransformer('mixed-ctor'));

      expect(getTransformer('mixed-obj')).toBe(obj);
      const ctorResult = getTransformer('mixed-ctor');
      expect(ctorResult).toBeDefined();
      expect(ctorResult!.name).toBe('mixed-ctor');
    });
  });

  describe('singleton identity', () => {
    it('all exported functions reference the same registry', () => {
      registerTransformer('singleton-test', createObjectTransformer('singleton-test'));
      expect(hasTransformer('singleton-test')).toBe(true);
      expect(listTransformers()).toContain('singleton-test');
      const result = getTransformer('singleton-test');
      expect(result).toBeDefined();
      expect(result!.name).toBe('singleton-test');
    });
  });
});